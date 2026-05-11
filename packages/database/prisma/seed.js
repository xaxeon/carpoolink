import { PrismaClient, FieldName } from '@prisma/client';
const prisma = new PrismaClient();

const surveyQuestions = [
    {
        code: 'goal',
        content: '나의 목적 및 성장 단계는?',
        displayOrder: 1,
        options: [
            { code: 'A', label: '취업 준비형', description: '당장 포트폴리오 완성, 면접 대비, 직무 역량 강화가 시급해요.', displayOrder: 1 },
            { code: 'B', label: '직무 탐색형', description: '해당 분야의 생생한 현업 이야기를 듣거나, 같은 고민을 하는 사람들과 교류하고 싶어요.', displayOrder: 2 },
        ],
    },
    {
        code: 'style',
        content: '나의 학습 성향 및 소통 스타일은?',
        displayOrder: 2,
        options: [
            { code: 'A', label: '질문 폭격기형', description: '스스로 공부하다가 막히는 부분을 조목조목 질문하고 답을 얻는 방식을 선호해요.', displayOrder: 1 },
            { code: 'B', label: '자율 주도형', description: '큰 방향성만 제시해주면 스스로 파고드는 것을 좋아하며, 멘토를 \'가이드\'로 활용하고 싶어요.', displayOrder: 2 },
        ],
    },
    {
        code: 'preference',
        content: '내가 원하는 멘토 스타일은?',
        displayOrder: 3,
        options: [
            { code: 'A', label: '스파르타형', description: '강한 피드백과 많은 과제,\n확실한 푸시를 원해요.', displayOrder: 1 },
            { code: 'B', label: '페이스메이커형', description: '꾸준히 할 수 있도록 옆에서 격려해주고, 심리적인 지지를 중시해요.', displayOrder: 2 },
        ],
    },
    {
        code: 'focus',
        content: '나의 관심 도메인 및 기술 스택은?',
        displayOrder: 4,
        options: [
            { code: 'A', label: '특정 직무/분야', description: '백엔드, 프론트엔드, 데이터 분석, 기획, 디자인 같은 특정 직무/분야에 대해 알고싶어요.', displayOrder: 1 },
            { code: 'B', label: '전체 산업군', description: '이커머스, 핀테크, AI, 게임 등 관심 있는 영역의 전체 산업에 대해 알고싶어요.', displayOrder: 2 },
        ],
    },
];

const surveyResult = {
    "AAAA": "불도저 스나이퍼",
    "AAAB": "야망의 야생마",
    "AABA": "열정의 레이서",
    "ABAA": "철갑의 장인",
    "BAAA": "지식 다이버",
    "AABB": "공감형 전략가",
    "ABAB": "냉철한 분석가",
    "BAAB": "트렌드 헌터",
    "ABBA": "묵직한 해결사",
    "BABA": "호기심 꿈나무",
    "BBAA": "자유로운 연구원",
    "ABBB": "든든한 파트너",
    "BABB": "사교적인 여행가",
    "BBAB": "창의적인 모험가",
    "BBBA": "조용한 관찰자",
    "BBBB": "낭만적인 산책자"
};

async function main() {
    const fields = Object.values(FieldName);

    // 분야 데이터 시드
    for (const name of fields) {
        await prisma.field.upsert({
            where: { fieldName: name },
            update: {},
            create: { fieldName: name },
        });
    }

    // 사전 설문 질문 및 옵션 시드
    for (const question of surveyQuestions) {
        // 질문
        const surveyQuestion = await prisma.surveyQuestion.upsert({
            where: { code: question.code },
            update: {
                content: question.content,
                displayOrder: question.displayOrder,
            },
            create: {
                code: question.code,
                content: question.content,
                displayOrder: question.displayOrder,
            },
        });

        // 선택지
        for (const option of question.options) {
            await prisma.surveyQuestionOption.upsert({
                where: {
                    surveyQuestionId_code: {
                        surveyQuestionId: surveyQuestion.surveyQuestionId,
                        code: option.code,
                    },
                },
                update: {
                    label: option.label,
                    description: option.description,
                    displayOrder: option.displayOrder,
                },
                create: {
                    surveyQuestionId: surveyQuestion.surveyQuestionId,
                    code: option.code,
                    label: option.label,
                    description: option.description,
                    displayOrder: option.displayOrder,
                },
            });
        }
    }

    for (const [combinationCode, title] of Object.entries(surveyResult)) {
        await prisma.surveyResult.upsert({
            where: { combinationCode },
            update: { title },
            create: {
                combinationCode,
                title,
            },
        });
    }

    // 테스트용 멘토 유저
    const mentor = await prisma.user.upsert({
        where: { email: "mentor@test.com" },
        update: {},
        create: {
            email: "mentor@test.com",
            nickname: "테스트멘토",
            role: "MENTOR",
        },
    });

    // 테스트용 멘티 유저
    const mentee = await prisma.user.upsert({
        where: { email: "mentee@test.com" },
        update: {},
        create: {
            email: "mentee@test.com",
            nickname: "테스트멘티",
            role: "MENTEE",
        },
    });

    // 테스트용 멘토링 세션 (호스트는 멘토)
    const existingMentoring = await prisma.mentoring.findFirst({
        where: { title: "테스트 멘토링" },
    });

    if (existingMentoring) {
        await prisma.mentoring.update({
            where: { mentoringId: existingMentoring.mentoringId },
            data: {
                isGroup: false,
                status: "READY",
                isScriptPublished: true,
                userId: mentor.userId,
            },
        });
    } else {
        await prisma.mentoring.create({
            data: {
                title: "테스트 멘토링",
                isGroup: false,
                status: "READY",
                isScriptPublished: true,
                userId: mentor.userId,
            },
        });
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });