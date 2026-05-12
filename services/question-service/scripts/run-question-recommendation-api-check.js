import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { generateQuestionRecommendations } from '../src/lib/questionRecommendationClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });

const outputDir = path.join(__dirname, '..', 'outputs', 'question-recommendation-api-tests');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputPath = path.join(outputDir, `recommendation-api-test-${timestamp}.json`);

const model = process.env.QUESTION_RECOMMENDATION_TEST_MODEL || 'gpt-5-nano';
const reasoningEffort = process.env.QUESTION_RECOMMENDATION_TEST_REASONING_EFFORT || 'minimal';
const pricing = {
    source: 'https://platform.openai.com/docs/pricing',
    currency: 'USD',
    unit: 'per_1m_tokens',
    input: 0.05,
    output: 0.40,
};

const params = {
    sessionId: 42,
    topic: '프론트엔드 취업 포트폴리오에서 상태 관리 경험 설명하기',
    context: [
        '멘티는 신입 프론트엔드 개발자 취업을 준비하고 있으며, React 프로젝트를 포트폴리오에 정리하고 있습니다.',
        '최근 프로젝트에서 장바구니, 필터, 모달, 비동기 로딩 상태가 섞이면서 useState만으로 상태 변경 흐름을 추적하기 어려웠습니다.',
        '멘토는 상태가 여러 이벤트에 의해 바뀌거나 변경 규칙이 복잡해질 때 useReducer를 고려할 수 있다고 설명했습니다.',
        '멘티는 아직 useReducer를 실제로 적용해 본 경험이 적고, 면접에서 useState와 useReducer의 차이를 어떻게 설명해야 할지 고민하고 있습니다.',
        '멘티가 이어서 물어볼 질문을 추천해 주세요.',
    ].join('\n'),
    count: 3,
    mentee: {
        id: 10,
        level: 'junior-ready',
        interests: ['React', 'frontend', 'portfolio'],
        goals: ['상태 관리 선택 기준 이해', '면접에서 프로젝트 경험 설명하기', '포트폴리오 개선 방향 찾기'],
    },
    mentor: {
        id: 3,
        expertise: ['React', 'frontend architecture', 'technical interview'],
        role: 'senior frontend engineer',
    },
    answerabilityContext: {
        sessionTopic: '프론트엔드 취업 포트폴리오에서 상태 관리 경험 설명하기',
        previousScriptSections: [
            '멘토는 포트폴리오에서 단순히 사용 기술을 나열하기보다 어떤 문제를 발견했고 어떤 기준으로 개선했는지를 설명하는 것이 중요하다고 안내했습니다.',
            '멘토는 면접 답변에서 문제 상황, 선택지 비교, 선택 이유, 결과 순서로 말하면 이해하기 쉽다고 설명했습니다.',
        ],
        currentScriptSection: '현재 멘토는 장바구니, 필터, 모달, 비동기 로딩 상태가 섞인 React 프로젝트에서 useState만으로 상태 변경 흐름을 추적하기 어려웠던 상황을 예로 들고 있습니다.',
        currentSlideTitle: '상태 관리 복잡도와 useReducer 선택 기준',
        nextScriptSection: '다음에는 useReducer로 상태 전환 규칙을 정리한 경험을 포트폴리오와 면접 답변에 녹이는 방법을 다룰 예정입니다.',
        recentMentorUtterances: [
            '상태가 여러 이벤트에 의해 바뀌고 변경 규칙이 복잡하면 useReducer를 고려할 수 있어요.',
            '면접에서는 useReducer를 썼다는 사실보다 왜 useState만으로 부족했는지를 설명하는 게 더 중요합니다.',
            '포트폴리오에는 상태 전환 규칙을 어떻게 정리했는지 보여주는 예시가 있으면 좋아요.',
        ],
        menteeProfile: '신입 프론트엔드 개발자 취업 준비생. React 프로젝트를 포트폴리오로 정리 중이며 상태 관리 선택 기준과 면접 설명 방식이 고민입니다.',
        mentorProfile: '시니어 프론트엔드 엔지니어. React 아키텍처, 상태 관리 리팩터링, 기술 면접 코칭 경험이 있습니다.',
        mentorExpertiseEvidence: [
            'React 프로젝트에서 useState, useReducer, 전역 상태 관리 선택 기준을 리뷰한 경험이 있습니다.',
            '신입 개발자의 포트폴리오 프로젝트 설명과 기술 면접 답변을 코칭한 경험이 있습니다.',
        ],
        mentorPastScripts: [
            '상태 관리 선택은 기술 이름보다 상태 변경 규칙의 복잡도와 추적 가능성을 기준으로 설명하면 좋습니다.',
            '면접 답변은 문제 상황, 대안, 선택 이유, 결과를 짧게 연결해야 합니다.',
        ],
        answeredQuestions: [
            'useReducer와 useState의 기본적인 차이는 무엇인가요?',
        ],
        queuedQuestions: [
            'Redux도 같이 공부해야 하나요?',
        ],
    },
};

function estimateCost(usage) {
    if (!usage) {
        return null;
    }

    const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;

    return {
        inputTokens,
        outputTokens,
        estimatedUsd: Number(((inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000).toFixed(8)),
    };
}

async function main() {
    const startedAt = new Date().toISOString();
    let record;

    try {
        const result = await generateQuestionRecommendations(params, {
            model,
            reasoningEffort,
            includeMetadata: true,
        });
        const completedAt = new Date().toISOString();
        const usage = result.metadata?.usage ?? null;

        record = {
            status: 'success',
            startedAt,
            completedAt,
            request: {
                model,
                reasoningEffort,
                params,
            },
            pricing,
            costEstimate: estimateCost(usage),
            response: result,
        };
    } catch (error) {
        const completedAt = new Date().toISOString();
        record = {
            status: 'failed',
            startedAt,
            completedAt,
            request: {
                model,
                reasoningEffort,
                params,
            },
            pricing,
            error: {
                name: error.name,
                code: error.code ?? null,
                status: error.status ?? null,
                message: error.message,
            },
        };
    }

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    console.log(outputPath);
    console.log(JSON.stringify({
        status: record.status,
        model,
        costEstimate: record.costEstimate ?? null,
        questionCount: record.response?.questions?.length ?? 0,
        error: record.error ?? null,
    }, null, 2));

    if (record.status !== 'success') {
        process.exitCode = 1;
    }
}

await main();
