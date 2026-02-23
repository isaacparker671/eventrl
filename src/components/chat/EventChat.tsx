"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  sender_type: "HOST" | "GUEST" | "SYSTEM";
  sender_name: string;
  body: string;
  created_at: string;
  reply_to_message_id: string | null;
  can_delete: boolean;
};

type Poll = {
  id: string;
  question: string;
  created_at: string;
};

type PollVote = {
  poll_id: string;
  vote: "YES" | "NO";
};

type Reaction = {
  message_id: string;
  reaction: "UP" | "DOWN" | "LAUGH";
};

type PendingQuestion = {
  id: string;
  body: string;
};

type FeedItem =
  | { type: "message"; key: string; createdAtMs: number; message: ChatMessage }
  | { type: "poll"; key: string; createdAtMs: number; poll: Poll };

function sameMessages(a: ChatMessage[], b: ChatMessage[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].id !== b[i].id ||
      a[i].body !== b[i].body ||
      a[i].sender_name !== b[i].sender_name ||
      a[i].sender_type !== b[i].sender_type ||
      a[i].created_at !== b[i].created_at ||
      a[i].reply_to_message_id !== b[i].reply_to_message_id ||
      a[i].can_delete !== b[i].can_delete
    ) {
      return false;
    }
  }
  return true;
}

export default function EventChat({
  eventId,
  accentTitle,
  actor,
}: {
  eventId: string;
  accentTitle: string;
  actor: "host" | "guest";
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinNotice, setJoinNotice] = useState<string | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [pollVoteCounts, setPollVoteCounts] = useState<PollVote[]>([]);
  const [pollMyVotes, setPollMyVotes] = useState<PollVote[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [questionRequest, setQuestionRequest] = useState("");
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  const [interactionMode, setInteractionMode] = useState<"RESTRICTED" | "OPEN_CHAT">("OPEN_CHAT");
  const [actorReactionByMessage, setActorReactionByMessage] = useState<Record<string, Reaction["reaction"]>>({});
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const [composeMode, setComposeMode] = useState<"MESSAGE" | "POLL_YES_NO" | "REQUESTS">("MESSAGE");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const actorReactionByMessageRef = useRef<Record<string, Reaction["reaction"]>>({});
  const pendingReactionMessageIdsRef = useRef<Set<string>>(new Set());
  const latestJoinNoticeIdRef = useRef<string | null>(null);
  const isNearBottomRef = useRef(true);
  const lastFeedCountRef = useRef(0);
  const longPressTimeoutRef = useRef<number | null>(null);
  const joinNoticeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    actorReactionByMessageRef.current = actorReactionByMessage;
  }, [actorReactionByMessage]);

  const fetchMessages = useCallback(async () => {
    const response = await fetch(`/api/chat/${eventId}/messages`, {
      cache: "no-store",
      headers: {
        "x-eventrl-actor": actor,
      },
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          messages?: ChatMessage[];
          reactions?: Reaction[];
          interactionMode?: "RESTRICTED" | "OPEN_CHAT";
          actorReactions?: Reaction[];
          error?: string;
        }
      | null;
    if (!response.ok || !payload || payload.error) {
      setError(payload?.error ?? "Failed to load chat.");
      return;
    }

    const joinSystemMessages = (payload.messages ?? []).filter(
      (message) =>
        message.sender_type === "SYSTEM" &&
        (message.body.includes("joined the chat") || message.body.includes("paid and was approved")),
    );
    const newestJoinSystemMessage = joinSystemMessages[joinSystemMessages.length - 1];
    if (newestJoinSystemMessage && newestJoinSystemMessage.id !== latestJoinNoticeIdRef.current) {
      latestJoinNoticeIdRef.current = newestJoinSystemMessage.id;
      setJoinNotice(newestJoinSystemMessage.body);
      if (joinNoticeTimeoutRef.current) {
        window.clearTimeout(joinNoticeTimeoutRef.current);
      }
      joinNoticeTimeoutRef.current = window.setTimeout(() => {
        setJoinNotice(null);
      }, 2600);
    }

    const nextMessages = (payload.messages ?? []).filter((message) => {
      if (message.sender_type !== "SYSTEM") return true;
      if (message.body.startsWith("New poll:")) return false;
      if (message.body.includes("joined the chat")) return false;
      if (message.body.includes("paid and was approved")) return false;
      return true;
    });
    setMessages((previous) => (sameMessages(previous, nextMessages) ? previous : nextMessages));

    const pendingMessages = pendingReactionMessageIdsRef.current;
    const nextReactions = payload.reactions ?? [];
    setReactions((previous) => {
      if (!pendingMessages.size) {
        return nextReactions;
      }
      const serverStable = nextReactions.filter((entry) => !pendingMessages.has(entry.message_id));
      const optimisticPending = previous.filter((entry) => pendingMessages.has(entry.message_id));
      return [...serverStable, ...optimisticPending];
    });

    setInteractionMode(payload.interactionMode ?? "OPEN_CHAT");

    const nextActorReactions = Object.fromEntries(
      (payload.actorReactions ?? []).map((entry) => [entry.message_id, entry.reaction]),
    ) as Record<string, Reaction["reaction"]>;
    setActorReactionByMessage((previous) => {
      if (!pendingMessages.size) {
        return nextActorReactions;
      }
      const merged = { ...nextActorReactions };
      pendingMessages.forEach((messageId) => {
        if (previous[messageId]) {
          merged[messageId] = previous[messageId];
        } else {
          delete merged[messageId];
        }
      });
      return merged;
    });

    setError(null);
  }, [actor, eventId]);

  const fetchPolls = useCallback(async () => {
    const response = await fetch(`/api/chat/${eventId}/polls`, {
      cache: "no-store",
      headers: { "x-eventrl-actor": actor },
    });
    const payload = (await response.json().catch(() => null)) as
      | { polls?: Poll[]; voteCounts?: PollVote[]; myVotes?: PollVote[] }
      | null;
    if (!response.ok || !payload) return;
    setPolls(payload.polls ?? []);
    setPollVoteCounts(payload.voteCounts ?? []);
    setPollMyVotes(payload.myVotes ?? []);
  }, [actor, eventId]);

  const fetchPendingQuestions = useCallback(async () => {
    if (actor !== "host") return;
    const response = await fetch(`/api/chat/${eventId}/questions`, {
      cache: "no-store",
      headers: { "x-eventrl-actor": actor },
    });
    const payload = (await response.json().catch(() => null)) as { questions?: PendingQuestion[] } | null;
    if (!response.ok || !payload) return;
    setPendingQuestions(payload.questions ?? []);
  }, [actor, eventId]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      await fetchMessages();
      await fetchPolls();
      await fetchPendingQuestions();
      if (mounted) setLoading(false);
    };
    void run();

    const interval = window.setInterval(() => {
      void fetchMessages();
      void fetchPolls();
      void fetchPendingQuestions();
    }, 1000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      if (longPressTimeoutRef.current) {
        window.clearTimeout(longPressTimeoutRef.current);
      }
      if (joinNoticeTimeoutRef.current) {
        window.clearTimeout(joinNoticeTimeoutRef.current);
      }
    };
  }, [fetchMessages, fetchPendingQuestions, fetchPolls]);

  const reactionCounts = useMemo(() => {
    const counts: Record<string, { UP: number; DOWN: number; LAUGH: number }> = {};
    reactions.forEach((entry) => {
      const current = counts[entry.message_id] ?? { UP: 0, DOWN: 0, LAUGH: 0 };
      current[entry.reaction] += 1;
      counts[entry.message_id] = current;
    });
    return counts;
  }, [reactions]);

  const feedItems = useMemo<FeedItem[]>(() => {
    const messageItems = messages.map((message) => ({
      type: "message" as const,
      key: `m:${message.id}`,
      createdAtMs: new Date(message.created_at).getTime(),
      message,
    }));
    const pollItems = polls.map((poll) => ({
      type: "poll" as const,
      key: `p:${poll.id}`,
      createdAtMs: new Date(poll.created_at).getTime(),
      poll,
    }));

    return [...messageItems, ...pollItems].sort((a, b) => {
      if (a.createdAtMs === b.createdAtMs) {
        return a.key.localeCompare(b.key);
      }
      return a.createdAtMs - b.createdAtMs;
    });
  }, [messages, polls]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const previousCount = lastFeedCountRef.current;
    const nextCount = feedItems.length;
    const hasNewItems = nextCount > previousCount;

    if ((previousCount === 0 && nextCount > 0) || (hasNewItems && isNearBottomRef.current)) {
      container.scrollTop = container.scrollHeight;
    }
    lastFeedCountRef.current = nextCount;
  }, [feedItems]);

  const onSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;

    if (actor === "host" && composeMode === "REQUESTS") {
      return;
    }

    if (actor === "host" && composeMode === "POLL_YES_NO") {
      setSending(true);
      setError(null);
      const response = await fetch(`/api/chat/${eventId}/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-eventrl-actor": actor },
        body: JSON.stringify({ question: body }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok || payload?.error) {
        setError(payload?.error ?? "Failed to post poll.");
        setSending(false);
        return;
      }
      setText("");
      setComposeMode("MESSAGE");
      setSending(false);
      await fetchPolls();
      await fetchMessages();
      return;
    }

    setSending(true);
    setError(null);
    const response = await fetch(`/api/chat/${eventId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-eventrl-actor": actor,
      },
      body: JSON.stringify({ body, replyToMessageId: replyToMessage?.id ?? null }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok || payload?.error) {
      setError(payload?.error ?? "Failed to send.");
      setSending(false);
      return;
    }
    setText("");
    setReplyToMessage(null);
    setSending(false);
    await fetchMessages();
    await fetchPolls();
  };

  const react = async (messageId: string, emoji: "👍" | "👎" | "😂") => {
    const nextReaction: Reaction["reaction"] = emoji === "👍" ? "UP" : emoji === "👎" ? "DOWN" : "LAUGH";
    const previousReaction = actorReactionByMessageRef.current[messageId];

    setActorReactionByMessage((prev) => {
      const next = { ...prev };
      if (previousReaction === nextReaction) {
        delete next[messageId];
      } else {
        next[messageId] = nextReaction;
      }
      return next;
    });

    setReactions((prev) => {
      const next = [...prev];
      if (previousReaction) {
        const removeIndex = next.findIndex(
          (entry) => entry.message_id === messageId && entry.reaction === previousReaction,
        );
        if (removeIndex >= 0) next.splice(removeIndex, 1);
      }
      if (previousReaction !== nextReaction) {
        next.push({ message_id: messageId, reaction: nextReaction });
      }
      return next;
    });

    pendingReactionMessageIdsRef.current.add(messageId);

    const response = await fetch(`/api/chat/${eventId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-eventrl-actor": actor },
      body: JSON.stringify({ messageId, emoji }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok || payload?.error) {
      setError(payload?.error ?? "Failed to react.");
      pendingReactionMessageIdsRef.current.delete(messageId);
      await fetchMessages();
    } else {
      setError(null);
      pendingReactionMessageIdsRef.current.delete(messageId);
    }
  };

  const deleteMessage = async (messageId: string) => {
    const response = await fetch(`/api/chat/${eventId}/messages`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-eventrl-actor": actor },
      body: JSON.stringify({ messageId }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok || payload?.error) {
      setError(payload?.error ?? "Failed to delete message.");
      return;
    }
    setActionMessageId(null);
    setReplyToMessage((current) => (current?.id === messageId ? null : current));
    await fetchMessages();
  };

  const votePoll = async (pollId: string, vote: "YES" | "NO") => {
    const response = await fetch(`/api/chat/${eventId}/polls/${pollId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-eventrl-actor": actor },
      body: JSON.stringify({ vote }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok || payload?.error) {
      setError(payload?.error ?? "Failed to vote.");
    } else {
      setError(null);
    }
    await fetchPolls();
  };

  const submitQuestionRequest = async () => {
    const body = questionRequest.trim();
    if (!body) return;
    await fetch(`/api/chat/${eventId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-eventrl-actor": actor },
      body: JSON.stringify({ body }),
    });
    setQuestionRequest("");
  };

  const reviewQuestion = async (questionId: string, action: "APPROVE" | "REJECT") => {
    await fetch(`/api/chat/${eventId}/questions/${questionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-eventrl-actor": actor },
      body: JSON.stringify({ action }),
    });
    await fetchPendingQuestions();
    await fetchMessages();
  };

  const reactionCount = (messageId: string, reaction: "UP" | "DOWN" | "LAUGH") =>
    reactionCounts[messageId]?.[reaction] ?? 0;

  const pollCount = (pollId: string, vote: "YES" | "NO") =>
    pollVoteCounts.filter((entry) => entry.poll_id === pollId && entry.vote === vote).length;

  const hasVoted = (pollId: string) =>
    pollMyVotes.some((vote) => vote.poll_id === pollId);

  const myReaction = (messageId: string) => actorReactionByMessage[messageId];
  const reactionButtonClass = (messageId: string, reaction: "UP" | "DOWN" | "LAUGH") =>
    myReaction(messageId) === reaction
      ? "secondary-btn bg-orange-600 text-white border-orange-600 hover:bg-orange-500"
      : "secondary-btn";

  const onContainerScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 48;
  };

  const messageById = useMemo(
    () => Object.fromEntries(messages.map((message) => [message.id, message])) as Record<string, ChatMessage>,
    [messages],
  );

  const openActions = (messageId: string) => {
    setActionMessageId((current) => (current === messageId ? null : messageId));
  };

  const startLongPress = (messageId: string) => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
    }
    longPressTimeoutRef.current = window.setTimeout(() => {
      openActions(messageId);
    }, 450);
  };

  const cancelLongPress = () => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  return (
    <section className="glass-card fade-in rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{accentTitle}</h2>
        <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-medium text-orange-700">
          LIVE CHAT
        </span>
      </div>
      {joinNotice ? (
        <p className="mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700">
          {joinNotice}
        </p>
      ) : null}

      <div
        ref={containerRef}
        onScroll={onContainerScroll}
        className="h-72 overflow-y-auto rounded-xl border border-neutral-200 bg-white/85 p-3 space-y-2"
      >
        {loading ? <p className="text-sm text-neutral-500">Loading chat...</p> : null}
        {!loading && !feedItems.length ? <p className="text-sm text-neutral-500">No messages yet.</p> : null}

        {feedItems.map((item) => {
          if (item.type === "poll") {
            return (
              <div key={item.key} className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-2">
                <p className="text-[11px] font-medium text-orange-700">Poll</p>
                <p className="mt-1 text-sm text-neutral-800">{item.poll.question}</p>
                <div className="mt-2 flex gap-2">
                  {actor === "guest" ? (
                    <>
                      <button
                        type="button"
                        className="secondary-btn px-2 py-1 text-xs"
                        onClick={() => votePoll(item.poll.id, "YES")}
                        disabled={hasVoted(item.poll.id)}
                      >
                        Yes {pollCount(item.poll.id, "YES")}
                      </button>
                      <button
                        type="button"
                        className="secondary-btn px-2 py-1 text-xs"
                        onClick={() => votePoll(item.poll.id, "NO")}
                        disabled={hasVoted(item.poll.id)}
                      >
                        No {pollCount(item.poll.id, "NO")}
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-neutral-600">
                      Yes {pollCount(item.poll.id, "YES")} · No {pollCount(item.poll.id, "NO")}
                    </p>
                  )}
                </div>
              </div>
            );
          }

          const message = item.message;
          const isSystem = message.sender_type === "SYSTEM";
          const replyTarget = message.reply_to_message_id ? messageById[message.reply_to_message_id] : null;
          return (
            <div
              key={item.key}
              onDoubleClick={() => openActions(message.id)}
              onTouchStart={() => startLongPress(message.id)}
              onTouchEnd={cancelLongPress}
              onTouchCancel={cancelLongPress}
              className={
                isSystem
                  ? "rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-2"
                  : "rounded-lg border border-neutral-200 bg-white px-2.5 py-2"
              }
            >
              <div className="flex items-center justify-between gap-2">
                <p
                  className={
                    isSystem ? "text-[11px] font-medium text-orange-700" : "text-[11px] font-medium text-neutral-700"
                  }
                >
                  {message.sender_name}
                </p>
                <p className="text-[10px] text-neutral-500">{new Date(message.created_at).toLocaleTimeString()}</p>
              </div>

              {replyTarget ? (
                <p className="mt-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] text-neutral-600">
                  Replying to {replyTarget.sender_name}: {replyTarget.body.slice(0, 60)}
                </p>
              ) : null}

              <p className={isSystem ? "mt-1 text-sm text-orange-800" : "mt-1 text-sm text-neutral-800"}>{message.body}</p>

              <div className="mt-2 flex items-center gap-2 text-xs">
                <button
                  type="button"
                  className={reactionButtonClass(message.id, "UP")}
                  onClick={() => react(message.id, "👍")}
                >
                  👍 {reactionCount(message.id, "UP")}
                </button>
                <button
                  type="button"
                  className={reactionButtonClass(message.id, "DOWN")}
                  onClick={() => react(message.id, "👎")}
                >
                  👎 {reactionCount(message.id, "DOWN")}
                </button>
                <button
                  type="button"
                  className={reactionButtonClass(message.id, "LAUGH")}
                  onClick={() => react(message.id, "😂")}
                >
                  😂 {reactionCount(message.id, "LAUGH")}
                </button>
              </div>

              {actionMessageId === message.id ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="secondary-btn px-2 py-1 text-xs"
                    onClick={() => {
                      setReplyToMessage(message);
                      setActionMessageId(null);
                    }}
                  >
                    Reply
                  </button>
                  {message.can_delete ? (
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
                      onClick={() => void deleteMessage(message.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {actor === "guest" && interactionMode === "RESTRICTED" ? (
        <div className="mt-3 space-y-2 rounded-xl border border-neutral-200 bg-white/90 p-3">
          <p className="text-xs font-medium text-neutral-600">Question Request (for restricted chat)</p>
          <div className="flex gap-2">
            <input
              className="input-field flex-1 text-sm"
              placeholder="Ask host a question..."
              value={questionRequest}
              onChange={(event) => setQuestionRequest(event.target.value)}
            />
            <button type="button" className="secondary-btn px-3 py-2 text-sm" onClick={submitQuestionRequest}>
              Send
            </button>
          </div>
        </div>
      ) : null}

      {replyToMessage ? (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-neutral-200 bg-white/80 px-3 py-2">
          <p className="text-xs text-neutral-600">
            Replying to {replyToMessage.sender_name}: {replyToMessage.body.slice(0, 70)}
          </p>
          <button type="button" className="secondary-btn px-2 py-1 text-xs" onClick={() => setReplyToMessage(null)}>
            Cancel
          </button>
        </div>
      ) : null}

      <form onSubmit={onSend} className="mt-3 space-y-2">
        {actor === "host" ? (
          <select
            value={composeMode}
            onChange={(event) => {
              const mode =
                event.target.value === "POLL_YES_NO"
                  ? "POLL_YES_NO"
                  : event.target.value === "REQUESTS"
                    ? "REQUESTS"
                    : "MESSAGE";
              setComposeMode(mode);
              if (mode !== "MESSAGE") {
                setReplyToMessage(null);
              }
            }}
            className="input-field text-sm"
          >
            <option value="MESSAGE">Message</option>
            <option value="POLL_YES_NO">Yes/No Poll</option>
            <option value="REQUESTS">Requests ({pendingQuestions.length})</option>
          </select>
        ) : null}
        {actor === "host" && composeMode === "REQUESTS" ? (
          <div className="rounded-xl border border-neutral-200 bg-white/90 p-3">
            {pendingQuestions.length ? (
              <div className="space-y-2">
                {pendingQuestions.map((question) => (
                  <div key={question.id} className="rounded-lg border border-neutral-200 p-2">
                    <p className="text-sm text-neutral-800">{question.body}</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="primary-btn px-2 py-1 text-xs"
                        onClick={() => reviewQuestion(question.id, "APPROVE")}
                      >
                        Approve to chat
                      </button>
                      <button
                        type="button"
                        className="secondary-btn px-2 py-1 text-xs"
                        onClick={() => reviewQuestion(question.id, "REJECT")}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-500">No pending requests.</p>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              className="input-field flex-1 text-sm"
              placeholder={
                actor === "host" && composeMode === "POLL_YES_NO"
                  ? "Type yes/no poll question..."
                  : "Send message..."
              }
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={500}
              disabled={sending}
            />
            <button className="primary-btn px-4 py-2 text-sm font-medium disabled:opacity-60" type="submit" disabled={sending}>
              {actor === "host" && composeMode === "POLL_YES_NO" ? "Post Poll" : "Send"}
            </button>
          </div>
        )}
      </form>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </section>
  );
}
