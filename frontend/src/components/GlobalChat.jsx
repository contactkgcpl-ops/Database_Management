import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export function GlobalChat() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIndex, setMentionIndex] = useState(-1);
  
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Poll for unread count when closed, or messages when open
  useEffect(() => {
    let intervalId;
    
    const fetchUnread = async () => {
      try {
        const res = await api.getChatUnreadCount();
        setUnreadCount(res.unread_count);
      } catch (err) {}
    };

    const fetchMessages = async () => {
      try {
        const res = await api.getChatMessages();
        setMessages(res);
        if (isOpen) {
          api.markChatRead().catch(() => {});
          setUnreadCount(0);
        }
      } catch (err) {}
    };

    if (isOpen) {
      fetchMessages();
      intervalId = setInterval(fetchMessages, 5000);
    } else {
      fetchUnread();
      intervalId = setInterval(fetchUnread, 10000);
    }

    return () => clearInterval(intervalId);
  }, [isOpen]);

  // Fetch users for mentions once
  useEffect(() => {
    api.users().then(res => {
      setUsers((res || []).filter(u => u.is_active));
    }).catch(() => {});
  }, []);

  // Auto scroll to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    setUnreadCount(0);
    api.markChatRead().catch(() => {});
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    setSending(true);
    try {
      await api.sendChatMessage(inputValue);
      setInputValue("");
      setShowMentions(false);
      // Immediately fetch to show our message
      const res = await api.getChatMessages();
      setMessages(res);
    } catch (err) {
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);

    // Mention detection
    const lastAtPos = val.lastIndexOf("@");
    if (lastAtPos !== -1) {
      const textAfterAt = val.slice(lastAtPos + 1);
      if (!textAfterAt.includes(" ")) {
        setShowMentions(true);
        setMentionFilter(textAfterAt.toLowerCase());
        setMentionIndex(-1);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (mentionUser) => {
    const lastAtPos = inputValue.lastIndexOf("@");
    if (lastAtPos !== -1) {
      const newVal = inputValue.slice(0, lastAtPos) + "@" + mentionUser.name + " ";
      setInputValue(newVal);
      setShowMentions(false);
      inputRef.current?.focus();
    }
  };

  const filteredUsers = users.filter(u => u.name.toLowerCase().includes(mentionFilter));

  const handleKeyDown = (e) => {
    if (showMentions && filteredUsers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredUsers.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredUsers.length) % filteredUsers.length);
      } else if (e.key === "Enter" && mentionIndex >= 0) {
        e.preventDefault();
        insertMention(filteredUsers[mentionIndex]);
      }
    } else {
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleSend(e);
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const cursor = e.target.selectionStart;
        const val = e.target.value;
        setInputValue(val.substring(0, cursor) + "\n" + val.substring(e.target.selectionEnd));
        setTimeout(() => {
          e.target.selectionStart = cursor + 1;
          e.target.selectionEnd = cursor + 1;
        }, 0);
      }
    }
  };

  return (
    <>
      {/* FAB Button */}
      <div 
        className="global-chat-fab"
        onClick={handleOpen}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          backgroundColor: "#128C7E",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          zIndex: 9998,
          transition: "transform 0.2s",
          transform: isOpen ? "scale(0)" : "scale(1)"
        }}
      >
        <MessageSquare size={24} />
        {unreadCount > 0 && (
          <div style={{
            position: "absolute",
            top: "-4px",
            right: "-4px",
            backgroundColor: "#ef4444",
            color: "white",
            fontSize: "12px",
            fontWeight: "bold",
            padding: "2px 6px",
            borderRadius: "10px",
            border: "2px solid #fff"
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </div>
        )}
      </div>

      {/* Chat Drawer/Modal */}
      <div style={{
        position: "fixed",
        top: isOpen ? "50%" : "200%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "90vw",
        height: "90vh",
        maxWidth: "1200px",
        backgroundColor: "#e5ddd5",
        borderRadius: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        zIndex: 9999,
        transition: "top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, sans-serif"
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: "#075E54",
          color: "white",
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ 
              width: "36px", 
              height: "36px", 
              backgroundColor: "#128C7E", 
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "bold"
            }}>
              SI
            </div>
            <div>
              <div style={{ fontWeight: "600", fontSize: "15px" }}>Company Chat</div>
              <div style={{ fontSize: "11px", opacity: 0.8 }}>All Team Members</div>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} style={{ background: "none", border: "none", color: "white", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {/* Messages Area */}
        <div style={{
          flex: 1,
          padding: "16px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          backgroundImage: "url('https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png')",
          backgroundSize: "initial",
          opacity: 0.95
        }}>
          {messages.map((msg, idx) => {
            const isMe = msg.user_id === user?.id;
            return (
              <div key={msg.id || idx} style={{
                alignSelf: isMe ? "flex-end" : "flex-start",
                backgroundColor: isMe ? "#dcf8c6" : "#ffffff",
                padding: "6px 12px",
                borderRadius: "8px",
                borderTopLeftRadius: !isMe ? "0" : "8px",
                borderTopRightRadius: isMe ? "0" : "8px",
                maxWidth: "85%",
                boxShadow: "0 1px 1px rgba(0,0,0,0.1)",
                position: "relative"
              }}>
                {!isMe && (
                  <div style={{ fontSize: "11px", fontWeight: "bold", color: "#075E54", marginBottom: "2px" }}>
                    {msg.user?.name || "System"}
                  </div>
                )}
                <div style={{ fontSize: "14px", color: "#303030", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                  {msg.message}
                </div>
                <div style={{ fontSize: "10px", color: "#999", textAlign: "right", marginTop: "4px" }}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div style={{
          backgroundColor: "#f0f0f0",
          padding: "10px",
          display: "flex",
          alignItems: "flex-end",
          gap: "8px",
          position: "relative"
        }}>
          {/* Mentions Popover */}
          {showMentions && filteredUsers.length > 0 && (
            <div style={{
              position: "absolute",
              bottom: "100%",
              left: "10px",
              right: "50px",
              backgroundColor: "white",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              maxHeight: "200px",
              overflowY: "auto",
              marginBottom: "8px",
              zIndex: 10
            }}>
              {filteredUsers.map((u, idx) => (
                <div 
                  key={u.id}
                  onClick={() => insertMention(u)}
                  onMouseEnter={() => setMentionIndex(idx)}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    backgroundColor: mentionIndex === idx ? "#f0f0f0" : "white",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "14px"
                  }}
                >
                  <div style={{
                    width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "#128C7E", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "bold"
                  }}>
                    {u.name.substring(0, 2).toUpperCase()}
                  </div>
                  {u.name}
                </div>
              ))}
            </div>
          )}

          <div style={{ flex: 1, backgroundColor: "white", borderRadius: "20px", display: "flex", alignItems: "center", padding: "8px 14px", minHeight: "40px" }}>
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              style={{
                border: "none",
                outline: "none",
                width: "100%",
                resize: "none",
                fontSize: "14px",
                maxHeight: "100px",
                fontFamily: "inherit",
                backgroundColor: "transparent"
              }}
              rows={1}
            />
          </div>
          <button 
            onClick={handleSend}
            disabled={!inputValue.trim() || sending}
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              backgroundColor: inputValue.trim() ? "#128C7E" : "#999",
              color: "white",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: inputValue.trim() ? "pointer" : "default",
              flexShrink: 0
            }}
          >
            <Send size={18} style={{ marginLeft: "2px" }} />
          </button>
        </div>
      </div>
    </>
  );
}
