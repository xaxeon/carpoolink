const VALID_STATUSES = new Set(['READY', 'ON_AIR', 'COMPLETED']);

function createHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

// mentoring 레코드를 일관된 형태로 변환하는 헬퍼 함수
function normalizeMentoring(record) {
    if (!record) {
        return null;
    }

    return {
        mentoringId: Number(record.mentoringId),
        title: record.title,
        isGroup: Boolean(record.isGroup),
        status: record.status,
        startedAt: record.startedAt ? new Date(record.startedAt).toISOString() : null,
        endedAt: record.endedAt ? new Date(record.endedAt).toISOString() : null,
        userId: Number(record.userId)
    };
}

// 간단한 인메모리 구현과 Prisma 기반 구현을 모두 지원하는 멘토링 리포지토리
class InMemoryMentoringRepository {
    constructor() {
        this.nextId = 1;
        this.sessions = new Map();
        this.participations = new Map();

        const mentorIds = (process.env.MEDIA_SERVER_MENTOR_IDS ?? '101')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => Number(item));

        this.userRoles = new Map();
        for (const mentorId of mentorIds) {
            this.userRoles.set(mentorId, 'MENTOR');
        }
    }

    // 새로운 멘토링 세션을 생성하는 메서드
    async createMentoring({ title, userId, isGroup, status }) {
        const mentoringId = this.nextId;
        this.nextId += 1;

        const session = {
            mentoringId,
            title,
            isGroup,
            status,
            startedAt: status === 'ON_AIR' ? new Date() : null,
            endedAt: null,
            userId: Number(userId)
        };

        this.sessions.set(mentoringId, session);
        return normalizeMentoring(session);
    }

    // 사용자 ID로 사용자 정보를 조회하는 메서드
    async getUserById(userId) {
        const role = this.userRoles.get(Number(userId));

        if (!role) {
            return {
                userId: Number(userId),
                role: 'MENTEE'
            };
        }

        return {
            userId: Number(userId),
            role
        };
    }

    // 사용자 ID로 멘토 권한을 확인하는 메서드
    async assertMentorUser(userId) {
        const user = await this.getUserById(userId);

        if (user.role !== 'MENTOR') {
            throw createHttpError(403, '멘토 권한이 필요합니다.');
        }

        return user;
    }

    // mentoringId로 멘토링 세션을 조회하는 메서드
    async getMentoringById(mentoringId) {
        return normalizeMentoring(this.sessions.get(Number(mentoringId)) ?? null);
    }

    // 멘토링 세션을 시작 상태로 전환하는 메서드
    async startMentoring(mentoringId, userId) {
        const key = Number(mentoringId);
        const current = this.sessions.get(key);

        if (!current) {
            throw createHttpError(404, 'Mentoring not found.');
        }

        if (Number(current.userId) !== Number(userId)) {
            throw createHttpError(403, '멘토링 세션을 시작할 권한이 없습니다.');
        }

        if (current.status !== 'READY') {
            throw createHttpError(409, 'READY 상태의 멘토링만 시작할 수 있습니다.');
        }

        const updated = {
            ...current,
            status: 'ON_AIR',
            startedAt: new Date(),
            endedAt: null
        };

        this.sessions.set(key, updated);
        return normalizeMentoring(updated);
    }

    // 멘토링 세션을 종료하는 메서드
    async endMentoring(mentoringId) {
        const key = Number(mentoringId);
        const current = this.sessions.get(key);

        if (!current) {
            throw new Error(`Mentoring ${key} not found`);
        }

        const updated = {
            ...current,
            status: 'COMPLETED',
            endedAt: new Date()
        };

        this.sessions.set(key, updated);
        return normalizeMentoring(updated);
    }

    // 멘토링 참여자를 관리하는 메서드
    async ensureMentoringParticipant({ mentoringId, userId }) {
        const mentoring = this.sessions.get(Number(mentoringId));

        if (!mentoring) {
            throw createHttpError(404, 'Mentoring not found.');
        }

        const numericUserId = Number(userId);

        if (numericUserId === Number(mentoring.userId)) {
            return { created: false, isHost: true };
        }

        const key = Number(mentoringId);

        if (!this.participations.has(key)) {
            this.participations.set(key, new Set());
        }

        const participants = this.participations.get(key);

        if (participants.has(numericUserId)) {
            return { created: false, isHost: false };
        }

        participants.add(numericUserId);
        return { created: true, isHost: false };
    }
}

// Prisma가 사용 가능한 경우 실제 데이터베이스와 상호작용하는 리포지토리 구현
class PrismaMentoringRepository {
    constructor(prisma) {
        this.prisma = prisma;
    }

    // 새로운 멘토링 세션을 데이터베이스에 생성하는 메서드
    async createMentoring({ title, userId, isGroup, status }) {
        if (!VALID_STATUSES.has(status)) {
            throw new Error(`Invalid mentoring status: ${status}`);
        }

        const created = await this.prisma.mentoring.create({
            data: {
                title,
                isGroup,
                status,
                startedAt: status === 'ON_AIR' ? new Date() : null,
                userId: BigInt(userId)
            }
        });

        return normalizeMentoring(created);
    }

    async getUserById(userId) {
        return this.prisma.user.findUnique({
            where: { userId: BigInt(userId) },
            select: {
                userId: true,
                role: true,
                nickname: true
            }
        });
    }

    async assertMentorUser(userId) {
        const user = await this.getUserById(userId);

        if (!user) {
            throw createHttpError(404, '사용자를 찾을 수 없습니다.');
        }

        if (user.role !== 'MENTOR') {
            throw createHttpError(403, '멘토 권한이 필요합니다.');
        }

        return {
            ...user,
            userId: Number(user.userId)
        };
    }

    // mentoringId로 멘토링 세션을 데이터베이스에서 조회하는 메서드
    async getMentoringById(mentoringId) {
        const found = await this.prisma.mentoring.findUnique({
            where: {
                mentoringId: BigInt(mentoringId)
            }
        });

        return normalizeMentoring(found);
    }

    // 멘토링 세션을 시작 상태로 전환하는 메서드
    async startMentoring(mentoringId, userId) {
        const numericMentoringId = Number(mentoringId);
        const numericUserId = Number(userId);

        const mentoring = await this.prisma.mentoring.findUnique({
            where: {
                mentoringId: BigInt(numericMentoringId)
            },
            select: {
                mentoringId: true,
                userId: true,
                status: true,
                isGroup: true
            }
        });

        if (!mentoring) {
            throw createHttpError(404, '멘토링을 찾을 수 없습니다.');
        }

        if (mentoring.isGroup) {
            throw createHttpError(400, '1:1 멘토링만 시작할 수 있습니다.');
        }

        if (Number(mentoring.userId) !== numericUserId) {
            throw createHttpError(403, '멘토링 세션을 시작할 권한이 없습니다.');
        }

        if (mentoring.status !== 'READY') {
            throw createHttpError(409, 'READY 상태의 멘토링만 시작할 수 있습니다.');
        }

        const updated = await this.prisma.mentoring.update({
            where: {
                mentoringId: BigInt(numericMentoringId)
            },
            data: {
                status: 'ON_AIR',
                startedAt: new Date(),
                endedAt: null
            }
        });

        return normalizeMentoring(updated);
    }

    // 멘토링 세션을 데이터베이스에서 종료하는 메서드
    async endMentoring(mentoringId) {
        const updated = await this.prisma.mentoring.update({
            where: {
                mentoringId: BigInt(mentoringId)
            },
            data: {
                status: 'COMPLETED',
                endedAt: new Date()
            }
        });

        return normalizeMentoring(updated);
    }

    async ensureMentoringParticipant({ mentoringId, userId }) {
        const numericMentoringId = Number(mentoringId);
        const numericUserId = Number(userId);

        const [user, mentoring] = await this.prisma.$transaction([
            this.prisma.user.findUnique({
                where: { userId: BigInt(numericUserId) },
                select: { userId: true, role: true }
            }),
            this.prisma.mentoring.findUnique({
                where: { mentoringId: BigInt(numericMentoringId) },
                select: { mentoringId: true, userId: true }
            })
        ]);

        if (!user) {
            throw createHttpError(404, '사용자를 찾을 수 없습니다.');
        }

        if (!mentoring) {
            throw createHttpError(404, '멘토링을 찾을 수 없습니다.');
        }

        if (Number(mentoring.userId) === numericUserId) {
            return { created: false, isHost: true };
        }

        const existing = await this.prisma.mentoringHistory.findFirst({
            where: {
                mentoringId: BigInt(numericMentoringId),
                userId: BigInt(numericUserId)
            },
            select: { mentoringHistoryId: true }
        });

        if (existing) {
            return { created: false, isHost: false };
        }

        await this.prisma.mentoringHistory.create({
            data: {
                mentoringId: BigInt(numericMentoringId),
                userId: BigInt(numericUserId)
            }
        });

        return { created: true, isHost: false };
    }
}

// 멘토링 리포지토리를 생성하는 팩토리 함수
export async function createMentoringRepository() {
    try {
        const { prisma } = await import('@carpoolink/database');
        return new PrismaMentoringRepository(prisma);
    } catch (error) {
        console.warn('[media-server] Prisma unavailable, using in-memory mentoring repository');
        return new InMemoryMentoringRepository();
    }
}
