function getChatServiceUrl() {
    return process.env.CHAT_SERVICE_URL || 'http://localhost:4001';
}

export async function emitQuestionEvent({ mentoringId, event, payload }) {
    const baseUrl = getChatServiceUrl();

    try {
        const response = await fetch(`${baseUrl}/internal/questions/events`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                mentoringId: Number(mentoringId),
                event,
                payload,
            }),
        });

        if (!response.ok) {
            const responseBody = await response.json().catch(() => null);
            throw new Error(responseBody?.message || `question event dispatch failed with ${response.status}`);
        }

        return true;
    } catch (error) {
        console.warn('[QuestionEventBridge] failed to dispatch question event:', error);
        return false;
    }
}