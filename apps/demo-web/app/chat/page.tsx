'use client';

import { SyntheticEvent, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type ChatMessage = {
    mentoringChatId?: string;
    mentoringId: string;
    userId: string;
    userName?: string;
    content: string;
    createdAt?: string;
};

type LogItem = {
    id: number;
    at: string;
    message: string;
};

const CHAT_URL_DEFAULT = 'http://localhost:4001';

function nowLabel() {
    return new Date().toLocaleTimeString('ko-KR', { hour12: false });
}

export default function ChatTestPage() {
    const [chatUrl, setChatUrl] = useState(CHAT_URL_DEFAULT);
    const [mentoringId, setMentoringId] = useState('');
    const [userId, setUserId] = useState('');
    const [userName, setUserName] = useState('tester');
    const [messageInput, setMessageInput] = useState('');

    const [connected, setConnected] = useState(false);
    const [joined, setJoined] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [logs, setLogs] = useState<LogItem[]>([]);

    const socketRef = useRef<Socket | null>(null);
    const nextLogId = useRef(1);

    const canJoin = useMemo(() => {
        return connected && mentoringId.trim() !== '' && userId.trim() !== '';
    }, [connected, mentoringId, userId]);

    const canSend = useMemo(() => {
        return joined && messageInput.trim() !== '';
    }, [joined, messageInput]);

    function addLog(message: string) {
        setLogs((prev) => {
            const item: LogItem = {
                id: nextLogId.current++,
                at: nowLabel(),
                message,
            };
            return [item, ...prev].slice(0, 120);
        });
    }

    function connectSocket() {
        if (socketRef.current) {
            addLog('이미 연결된 소켓이 있습니다.');
            return;
        }

        const socket = io(chatUrl, {
            transports: ['websocket', 'polling'],
            autoConnect: true,
        });

        socket.on('connect', () => {
            setConnected(true);
            addLog(`소켓 연결됨 (${socket.id})`);
        });

        socket.on('disconnect', (reason) => {
            setConnected(false);
            setJoined(false);
            addLog(`소켓 연결 해제됨: ${reason}`);
        });

        socket.on('error', (err) => {
            const message = typeof err === 'string' ? err : JSON.stringify(err);
            addLog(`에러 이벤트: ${message}`);
        });

        socket.on('user_joined', (data) => {
            addLog(`user_joined: ${JSON.stringify(data)}`);
        });

        socket.on('user_left', (data) => {
            addLog(`user_left: ${JSON.stringify(data)}`);
        });

        socket.on('room_closed', (data) => {
            setJoined(false);
            addLog(`room_closed: ${JSON.stringify(data)}`);
        });

        socket.on('new_message', (data: ChatMessage) => {
            setMessages((prev) => [...prev, data]);
        });

        socket.on('message_history', (history: ChatMessage[]) => {
            setMessages(history);
            addLog(`히스토리 수신: ${history.length}개`);
        });

        socketRef.current = socket;
        addLog(`소켓 연결 시도: ${chatUrl}`);
    }

    function disconnectSocket() {
        if (!socketRef.current) {
            return;
        }

        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
        setJoined(false);
        addLog('소켓 수동 연결 해제');
    }

    function joinChat() {
        const socket = socketRef.current;
        if (!socket) {
            addLog('소켓이 연결되어 있지 않습니다.');
            return;
        }

        addLog(`채팅방 입장 시도: mentoringId=${mentoringId}`);

        socket.emit(
            'join_chat',
            {
                mentoringId: mentoringId.trim(),
                userId: userId.trim(),
                userName: userName.trim() || 'anonymous',
            },
            (ack: { ok?: boolean; error?: string }) => {
                if (!ack?.ok) {
                    addLog(`채팅방 입장 실패: ${ack?.error ?? 'unknown error'}`);
                    setJoined(false);
                    return;
                }

                setJoined(true);
                addLog('채팅방 입장 성공');

                socket.emit('get_message_history', {
                    mentoringId: mentoringId.trim(),
                    limit: 100,
                    offset: 0,
                });
            }
        );
    }

    function leaveChat() {
        const socket = socketRef.current;
        if (!socket) {
            return;
        }

        socket.emit('leave_chat', {
            mentoringId: mentoringId.trim(),
            userId: userId.trim(),
            userName: userName.trim() || 'anonymous',
        });

        setJoined(false);
        addLog(`채팅방 나감: mentoringId=${mentoringId}`);
    }

    function sendMessage(e: SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();

        const socket = socketRef.current;
        const content = messageInput.trim();

        if (!socket || !content) {
            return;
        }

        socket.emit('send_message', {
            mentoringId: mentoringId.trim(),
            userId: userId.trim(),
            userName: userName.trim() || 'anonymous',
            content,
        });

        setMessageInput('');
    }

    useEffect(() => {
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
        };
    }, []);

    return (
        <main className="h-full bg-zinc-950 text-zinc-100 p-4 flex flex-col gap-3">
            <header>
                <h1 className="text-xl font-bold">채팅 테스트 화면</h1>
                <p className="text-xs text-zinc-400 mt-1">
                    mentoringId / userId 입력 후 소켓 연결 → 채팅방 입장 → 메시지 송신
                </p>
            </header>

            <section className="bg-zinc-900 rounded-xl p-3 border border-zinc-800 grid grid-cols-2 gap-2 text-sm">
                <label className="col-span-2">
                    <span className="text-zinc-400 text-xs">Chat Service URL</span>
                    <input
                        className="w-full mt-1 rounded-md bg-zinc-800 border border-zinc-700 px-2 py-2"
                        value={chatUrl}
                        onChange={(e) => setChatUrl(e.target.value)}
                        disabled={connected}
                    />
                </label>

                <label>
                    <span className="text-zinc-400 text-xs">Mentoring ID</span>
                    <input
                        className="w-full mt-1 rounded-md bg-zinc-800 border border-zinc-700 px-2 py-2"
                        value={mentoringId}
                        onChange={(e) => setMentoringId(e.target.value)}
                    />
                </label>

                <label>
                    <span className="text-zinc-400 text-xs">User ID</span>
                    <input
                        className="w-full mt-1 rounded-md bg-zinc-800 border border-zinc-700 px-2 py-2"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                    />
                </label>

                <label className="col-span-2">
                    <span className="text-zinc-400 text-xs">User Name</span>
                    <input
                        className="w-full mt-1 rounded-md bg-zinc-800 border border-zinc-700 px-2 py-2"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                    />
                </label>

                <div className="col-span-2 flex gap-2 mt-1">
                    {!connected ? (
                        <button
                            onClick={connectSocket}
                            className="flex-1 rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 py-2 font-semibold"
                        >
                            소켓 연결
                        </button>
                    ) : (
                        <button
                            onClick={disconnectSocket}
                            className="flex-1 rounded-md bg-red-600 hover:bg-red-500 px-3 py-2 font-semibold"
                        >
                            소켓 끊기
                        </button>
                    )}

                    {!joined ? (
                        <button
                            onClick={joinChat}
                            disabled={!canJoin}
                            className="flex-1 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 px-3 py-2 font-semibold"
                        >
                            채팅방 입장
                        </button>
                    ) : (
                        <button
                            onClick={leaveChat}
                            className="flex-1 rounded-md bg-amber-600 hover:bg-amber-500 px-3 py-2 font-semibold"
                        >
                            채팅방 나가기
                        </button>
                    )}
                </div>

                <div className="col-span-2 text-xs text-zinc-400 mt-1">
                    상태: {connected ? 'CONNECTED' : 'DISCONNECTED'} / {joined ? 'JOINED' : 'NOT_JOINED'}
                </div>
            </section>

            <section className="bg-zinc-900 rounded-xl p-3 border border-zinc-800">
                <form onSubmit={sendMessage} className="flex gap-2">
                    <input
                        className="flex-1 rounded-md bg-zinc-800 border border-zinc-700 px-2 py-2 text-sm"
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        placeholder="메시지를 입력하세요"
                    />
                    <button
                        type="submit"
                        disabled={!canSend}
                        className="rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 px-3 py-2 text-sm font-semibold"
                    >
                        전송
                    </button>
                </form>
            </section>

            <section className="grid grid-cols-1 gap-3 min-h-0 flex-1 overflow-hidden">
                <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-800 min-h-0 flex flex-col">
                    <h2 className="text-sm font-semibold mb-2">메시지</h2>
                    <div className="text-xs flex-1 overflow-auto space-y-2">
                        {messages.length === 0 ? (
                            <p className="text-zinc-500">아직 메시지가 없습니다.</p>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={`${msg.mentoringChatId ?? idx}-${msg.createdAt ?? idx}`} className="bg-zinc-800 rounded-md p-2">
                                    <div className="text-zinc-400">
                                        {msg.userName ?? msg.userId} ({msg.userId})
                                    </div>
                                    <div className="mt-1">{msg.content}</div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="bg-zinc-900 rounded-xl p-3 border border-zinc-800 min-h-0 flex flex-col">
                    <h2 className="text-sm font-semibold mb-2">이벤트 로그</h2>
                    <div className="text-xs flex-1 overflow-auto space-y-1">
                        {logs.length === 0 ? (
                            <p className="text-zinc-500">로그가 없습니다.</p>
                        ) : (
                            logs.map((log) => (
                                <div key={log.id} className="text-zinc-300">
                                    [{log.at}] {log.message}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>
        </main>
    );
}
