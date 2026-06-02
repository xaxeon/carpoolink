import { Router } from 'express';
import { prisma } from '@carpoolink/database';
import { requireUser } from '../middleware/requireUser.js';
import { serialize } from '../utils/serialize.js';

const router = Router();

// 클라이언트가 원하는 스크립트 유형을 파싱하는 함수
function parseType(type) {
    const normalized = String(type ?? 'all').toLowerCase();

    if (normalized === 'all' || normalized === 'group' || normalized === 'one-on-one') {
        return normalized;
    }

    return 'all';
}

// 클라이언트가 참여한 멘토링 중 스크립트가 존재하는 멘토링을 찾는 함수
function buildParticipatedMentoringWhere(userId, type) {
    const where = {
        status: 'COMPLETED',
        OR: [
            { userId },
            {
                participants: {
                    some: { userId },
                },
            },
        ],
    };

    if (type === 'group') {
        where.isGroup = true;
    }

    if (type === 'one-on-one') {
        where.isGroup = false;
    }

    return where;
}

// 스크립트 단락에 마스킹된 부분이 있는지 확인하는 함수
function hasMaskedFlag(content) {
    if (!content || typeof content !== 'object') {
        return false;
    }

    // pieces 배열 내부 검사
    if (Array.isArray(content.pieces)) {
        return content.pieces.some(piece => piece.isMasked === true);
    }

    // 전체 단락이 마스킹된 경우 검사
    return content.isMasked === true;
}

// 스크립트 조회 권한을 판단하는 함수
function canViewPrivateScript(script, viewerUserId, questionOwnerId = null) {
    if (!script.isPrivate) {
        return true;
    }

    const viewerIdStr = String(viewerUserId);
    const scriptOwnerIdStr = String(script.userId);
    const mentorIdStr = String(script.mentoring?.userId || script.mentoringUserId);
    const questionOwnerIdStr = questionOwnerId ? String(questionOwnerId) : null;

    // 비공개 질문 단락: 발화자 멘티(작성자)와 주관 멘토만 조회 가능
    return (
        viewerIdStr === mentorIdStr ||
        viewerIdStr === scriptOwnerIdStr ||
        (questionOwnerIdStr && viewerIdStr === questionOwnerIdStr)
    );
}

// 조회 권한을 확인해 마스킹/비공개 처리가 완료된 스크립트 단락을 반환하는 함수
function getVisibleContentWithParent(script, mentoring, viewerUserId, questionOwnerId) {
    // 헬퍼 매핑을 위해 script 내부에 mentoring 정보를 임시 주입
    const extendedScript = { ...script, mentoring };

    if (!canViewPrivateScript(extendedScript, viewerUserId, questionOwnerId)) {
        return {
            isPrivate: true,
            pieces: [{ text: '비공개 질문 및 답변입니다.', isMasked: false }],
        };
    }

    const content = script.content;
    if (content && Array.isArray(content.pieces)) {
        return {
            isPrivate: script.isPrivate || false,
            pieces: content.pieces.map(piece => ({
                text: piece.text || '',
                isMasked: piece.isMasked || false
            }))
        };
    }

    if (hasMaskedFlag(script.content)) {
        return {
            isPrivate: script.isPrivate || false,
            pieces: [{ text: content?.text || '마스킹된 단락입니다.', isMasked: true }]
        };
    }

    return {
        isPrivate: script.isPrivate || false,
        pieces: [{ text: content?.text || String(content || ''), isMasked: false }]
    };
}

// 스크립트 단락을 클라이언트에 반환할 형태로 매핑하는 함수
function mapScriptParagraph(script, viewerUserId, questionOwnerId = null) {
    const rawText = script.content?.text || '';
    const isMentor = script.userId === script.mentoring.userId;

    // "(질문 읽기) 비공개 질문입니다." 문구로 시작하고 멘토가 아닌 사람(즉, 질문한 멘티)이라면
    // 이 구간의 질문 당사자로 기억해 둡니다.
    if (script.isPrivate && rawText.trim().startsWith("(질문 읽기) 비공개 질문입니다.") && !isMentor) {
        questionOwnerId = script.userId;
    }
    // 비공개 구간이 끝나면(isPrivate가 false가 되면) 당사자 ID 플래그를 초기화합니다.
    else if (!script.isPrivate) {
        questionOwnerId = null;
    }

    // 권한 판단 시 실시간으로 추적된 currentQuestionOwnerId를 주입합니다.
    const visibility = getVisibleContentWithParent(script, script.mentoring, viewerUserId, questionOwnerId);

    return {
        scriptId: script.scriptId.toString(),
        isPrivate: script.isPrivate,
        createdAt: script.createdAt,
        content: {
            pieces: visibility.pieces,
            startTime: script.content?.startTime ?? null // 타임스탬프 백업 복원
        },
        speaker: {
            userId: script.userId.toString(),
            nickname: script.user?.nickname ?? '알 수 없음',
            role: script.user?.role ?? 'MENTEE',
            isHostMentor: isMentor,
        },
    };
}

// [GET] /scripts - 사용자가 참여했던 멘토링 중 스크립트가 존재하는 멘토링 목록 조회
router.get('/', requireUser, async (req, res, next) => {
    try {
        // 스크립트 유형 (전체/1:N/1:1)
        const type = parseType(req.query.type);
        const currentUserId = req.user.userId;

        // 조건에 맞는 멘토링 목록 조회
        const mentorings = await prisma.mentoring.findMany({
            where: {
                ...buildParticipatedMentoringWhere(currentUserId, type),
                scripts: {
                    some: {},
                },
            },
            include: {
                hostMentor: {
                    include: {
                        mentorProfile: {
                            select: { mentorId: true },
                        },
                    },
                },
                participants: {
                    include: {
                        user: {
                            select: {
                                userId: true,
                                nickname: true,
                            }
                        }
                    }
                },
                _count: {
                    select: {
                        scripts: true,
                    },
                },
            },
            orderBy: [{ startedAt: 'desc' }, { mentoringId: 'desc' }],
        });

        res.json(
            serialize({
                mentorings: mentorings.map((mentoring) => {
                    const isUserHost = mentoring.hostMentor.userId === currentUserId;

                    // 일대일(1:1)이고 내가 호스트라면 상대방은 첫 번째 참여자(멘티)
                    // 그 외(내가 멘티이거나 1:N)라면 상대방은 호스트(멘토)
                    const isOneOnOne = !mentoring.isGroup;
                    const counterpartUser = (isOneOnOne && isUserHost && mentoring.participants?.[0]?.user)
                        ? mentoring.participants[0].user
                        : mentoring.hostMentor;

                    return {
                        mentoringId: mentoring.mentoringId,
                        title: mentoring.title,
                        startedAt: mentoring.startedAt,
                        endedAt: mentoring.endedAt ?? null,
                        isGroup: mentoring.isGroup,
                        isScriptPublished: mentoring.isScriptPublished,

                        // 기존 host 객체는 유지하되, 프론트엔드 뷰에 맞춰 counterpart 객체를 추가
                        host: {
                            userId: mentoring.hostMentor.userId,
                            nickname: mentoring.hostMentor.nickname,
                            mentorId: mentoring.hostMentor.mentorProfile?.mentorId ?? null,
                        },
                        counterpart: {
                            userId: counterpartUser.userId,
                            nickname: counterpartUser.nickname,
                            // 내가 멘토인 경우 상대는 멘티이므로 role 판별에 쓸 수 있게 보냅니다.
                            role: isUserHost ? "MENTEE" : "MENTOR"
                        },
                        scriptCount: mentoring._count.scripts,
                    };
                }),
            })
        );
    } catch (error) {
        next(error);
    }
});

// [GET] /scripts/{mentoringId} - 해당 멘토링의 발행 완료된 스크립트 전문 조회
router.get('/:mentoringId', requireUser, async (req, res, next) => {
    try {
        let mentoringId;
        try {
            mentoringId = BigInt(req.params.mentoringId);
        } catch {
            return res.status(400).json({ message: '유효하지 않은 mentoringId입니다.' });
        }

        // 멘토링과 스크립트 조회 (접근 권한 및 스크립트 존재 여부 검증 포함)
        const mentoring = await prisma.mentoring.findFirst({
            where: {
                status: 'COMPLETED',
                isScriptPublished: req.user.role === 'MENTOR' ? undefined : true, // 멘토는 발행 여부 상관없이 조회 가능, 멘티는 발행된 스크립트인 경우만 조회 가능
                mentoringId,
                ...buildParticipatedMentoringWhere(req.user.userId),
                scripts: {
                    some: {},
                },
            },
            include: {
                hostMentor: {
                    include: {
                        mentorProfile: {
                            select: { mentorId: true },
                        },
                    },
                },
                scripts: {
                    include: {
                        user: true,
                    },
                    orderBy: [{ scriptId: 'asc' }, { createdAt: 'asc' }],
                },
            },
        });

        if (!mentoring) {
            return res.status(404).json({ message: '멘토링을 찾을 수 없거나 접근이 거부되었습니다.' });
        }

        let currentQuestionOwnerId = null;

        // 스크립트 단락별로 조회 권한을 판단해 마스킹/비공개 처리를 적용한 후 반환, createdAt 기준으로 정렬
        //const scripts = mentoring.scripts
        //    .map((script) => mapScriptParagraph({ ...script, mentoring }, req.user.userId, currentQuestionOwnerId))
        //    .filter(Boolean)
        //    .sort((left, right) => new Number(left.scriptId) - new Number(right.scriptId));

        const scripts = mentoring.scripts
            .map((script) => {
                const rawText = script.content?.text || '';
                const isMentor = script.userId === mentoring.userId;

                // "(질문 읽기) 비공개 질문입니다." 문구로 시작하고 멘토가 아닌 사람(즉, 질문한 멘티)이라면
                // 이 구간의 질문 당사자로 기억해 둡니다.
                if (script.isPrivate && rawText.trim().startsWith("(질문 읽기) 비공개 질문입니다.") && !isMentor) {
                    currentQuestionOwnerId = script.userId;
                }
                // 비공개 구간이 끝나면(isPrivate가 false가 되면) 당사자 ID 플래그를 초기화합니다.
                else if (!script.isPrivate) {
                    currentQuestionOwnerId = null;
                }

                // 권한 판단 시 실시간으로 추적된 currentQuestionOwnerId를 주입합니다.
                const visibility = getVisibleContentWithParent(script, mentoring, req.user.userId, currentQuestionOwnerId);

                return {
                    scriptId: script.scriptId.toString(),
                    isPrivate: script.isPrivate,
                    createdAt: script.createdAt,
                    content: {
                        pieces: visibility.pieces,
                        startTime: script.content?.startTime ?? null
                    },
                    speaker: {
                        userId: script.userId.toString(),
                        nickname: script.user?.nickname ?? '알 수 없음',
                        role: script.user?.role ?? 'MENTEE',
                        isHostMentor: isMentor,
                    },
                };
            })
            .filter(Boolean)
            .sort((left, right) => new Number(left.scriptId) - new Number(right.scriptId));

        res.json(
            serialize({
                mentoring: {
                    mentoringId: mentoring.mentoringId,
                    title: mentoring.title,
                    startedAt: mentoring.startedAt,
                    endedAt: mentoring.endedAt,
                    status: mentoring.status,
                    isGroup: mentoring.isGroup,
                    isScriptPublished: mentoring.isScriptPublished,
                    host: {
                        mentorId: mentoring.hostMentor.mentorProfile?.mentorId ?? null,
                        userId: mentoring.hostMentor.userId,
                        nickname: mentoring.hostMentor.nickname,
                    },
                },
                scripts,
            })
        );
    } catch (error) {
        next(error);
    }
});

// [GET] /scripts/:mentoringId/recent - 진행 중 멘토링 최근 스크립트 조회 (랭킹 맥락용)
router.get('/:mentoringId/recent', requireUser, async (req, res, next) => {
    try {
        let mentoringId;
        try {
            mentoringId = BigInt(req.params.mentoringId);
        } catch {
            return res.status(400).json({ message: '유효하지 않은 mentoringId입니다.' });
        }

        const limit = Math.min(parseInt(req.query.limit) || 5, 20);

        const mentoring = await prisma.mentoring.findFirst({
            where: {
                mentoringId,
                status: 'ON_AIR',
                userId: req.user.userId, // 주관 멘토만 조회 가능
            },
        });

        if (!mentoring) {
            return res.status(404).json({ message: '멘토링을 찾을 수 없거나 접근이 거부되었습니다.' });
        }

        const scripts = await prisma.script.findMany({
            where: { mentoringId },
            orderBy: [{ createdAt: 'desc' }, { scriptId: 'desc' }],
            take: limit,
        });

        res.json(serialize({
            scripts: scripts.reverse().map(s => ({
                scriptId: s.scriptId,
                text: s.content?.text ?? '',
                createdAt: s.createdAt,
            })),
        }));
    } catch (error) {
        next(error);
    }
});

// [PATCH] /scripts/:mentoringId/publish - 스크립트 단락 수정 및 멘토링 스크립트 발행
router.patch('/:mentoringId/publish', requireUser, async (req, res, next) => {
    try {
        let mentoringId;
        try {
            mentoringId = BigInt(req.params.mentoringId);
        } catch {
            return res.status(400).json({ message: '유효하지 않은 mentoringId입니다.' });
        }

        const { scripts } = req.body;

        if (!Array.isArray(scripts) || scripts.length === 0) {
            return res.status(400).json({ message: '업데이트할 스크립트 단락 배열(scripts)이 필요합니다.' });
        }

        // 1. 멘토링 정보 및 권한 확인
        const mentoring = await prisma.mentoring.findUnique({
            where: { mentoringId },
            select: {
                userId: true,
                status: true,
                isScriptPublished: true
            },
        });

        if (!mentoring) {
            return res.status(404).json({ message: '멘토링을 찾을 수 없습니다.' });
        }

        // 주관 멘토인지 확인
        if (mentoring.userId !== req.user.userId) {
            return res.status(403).json({ message: '스크립트를 발행할 권한이 없습니다.' });
        }

        if (mentoring.status !== 'COMPLETED') {
            return res.status(400).json({ message: '완료된 멘토링의 스크립트만 발행할 수 있습니다.' });
        }

        if (mentoring.isScriptPublished) {
            return res.status(400).json({ message: '이미 발행된 스크립트입니다. 더 이상 수정하거나 발행할 수 없습니다.' });
        }

        // 2. 트랜잭션으로 단락별 내용 업데이트 및 발행 상태 변경 수행
        await prisma.$transaction(async (tx) => {
            // 전달받은 스크립트 단락들 업데이트
            for (const script of scripts) {
                let scriptId;
                try {
                    scriptId = BigInt(script.scriptId);
                } catch {
                    continue; // 유효하지 않은 scriptId는 무시
                }

                await tx.script.update({
                    where: { scriptId },
                    data: {
                        content: script.content,
                    },
                });
            }

            // 멘토링 스크립트 발행 상태를 true로 변경
            await tx.mentoring.update({
                where: { mentoringId },
                data: {
                    isScriptPublished: true,
                },
            });
        });

        res.json(serialize({ message: '스크립트가 발행되었습니다.' }));
    } catch (error) {
        next(error);
    }
});

export default router;