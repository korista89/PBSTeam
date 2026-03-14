"use client";

import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { AuthCheck, useAuth } from "../components/AuthProvider";
import GlobalNav from "../components/GlobalNav";

interface Post {
    id: string;
    title: string;
    content: string;
    author: string;
    created_at: string;
    views: number;
}

export default function BoardPage() {
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const { user, isAdmin } = useAuth();

    const [isWriting, setIsWriting] = useState(false);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [writeLoading, setWriteLoading] = useState(false);

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editContent, setEditContent] = useState("");

    const fetchPosts = useCallback(async () => {
        try {
            setLoading(true);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            const res = await axios.get(`${apiUrl}/api/v1/board`);
            setPosts(res.data);
        } catch (err) {
            setError("게시글을 불러오는데 실패했습니다.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPosts(); }, [fetchPosts]);

    const handleWrite = async () => {
        if (!title.trim() || !content.trim()) return;
        setWriteLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            await axios.post(`${apiUrl}/api/v1/board`, {
                title, content, author: user?.id || "Teacher"
            });
            setTitle(""); setContent(""); setIsWriting(false);
            fetchPosts();
        } catch (err) { alert("작성 실패"); } finally { setWriteLoading(false); }
    };

    const handleDelete = async (postId: string) => {
        if (!confirm("삭제하시겠습니까?")) return;
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            await axios.delete(`${apiUrl}/api/v1/board/${postId}`, {
                params: { user_id: user?.id || "", role: isAdmin() ? "admin" : "teacher" }
            });
            fetchPosts();
        } catch (err) { alert("삭제 실패"); }
    };

    const handleUpdate = async (postId: string) => {
        if (!editTitle.trim() || !editContent.trim()) return;
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            await axios.put(`${apiUrl}/api/v1/board/${postId}`, {
                title: editTitle, content: editContent,
                user_id: user?.id || "", role: isAdmin() ? "admin" : "teacher"
            });
            setEditingId(null); fetchPosts();
        } catch (err) { alert("수정 실패"); }
    };

    return (
        <AuthCheck>
             <div style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: '80px' }}>
                <GlobalNav currentPage="board" />
                
                <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px' }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 950, color: '#1e293b', letterSpacing: '-0.04em' }}>
                                Hub Community
                            </h1>
                            <p style={{ margin: '8px 0 0 0', color: '#64748b', fontWeight: 600 }}>학교 소식 및 지원 전략 공유 게시판</p>
                        </div>
                        <button 
                            onClick={() => setIsWriting(!isWriting)}
                            style={{ 
                                padding: '12px 28px', 
                                background: isWriting ? '#fff' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                color: isWriting ? '#ef4444' : '#fff',
                                border: isWriting ? '1px solid #fee2e2' : 'none',
                                borderRadius: '16px', fontWeight: 800, cursor: 'pointer',
                                boxShadow: isWriting ? 'none' : '0 10px 15px rgba(99, 102, 241, 0.2)',
                                transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                            }}
                            onMouseOver={e=>!isWriting && (e.currentTarget.style.transform='translateY(-3px)')}
                            onMouseOut={e=>!isWriting && (e.currentTarget.style.transform='translateY(0)')}
                        >
                            {isWriting ? "Cancel" : "✏️ New Post"}
                        </button>
                    </div>

                    {/* Write Section */}
                    {isWriting && (
                        <div style={{ background: '#fff', padding: '32px', borderRadius: '28px', boxShadow: '0 20px 40px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)', marginBottom: '40px' }}>
                            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Post title..." style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #f1f5f9', background: '#f8fafc', fontSize: '1.1rem', fontWeight: 800, marginBottom: '16px', outline: 'none', boxSizing: 'border-box' }} onFocus={e=>e.currentTarget.style.borderColor='#6366f1'} />
                            <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Details..." style={{ width: '100%', minHeight: '180px', padding: '20px', borderRadius: '16px', border: '1px solid #f1f5f9', background: '#f8fafc', fontSize: '1rem', outline: 'none', transition: 'all 0.2s', boxSizing: 'border-box' }} onFocus={e=>e.currentTarget.style.borderColor='#6366f1'} />
                            <div style={{ textAlign: 'right', marginTop: '16px' }}>
                                <button onClick={handleWrite} disabled={writeLoading} style={{ padding: '12px 32px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: 800, cursor: 'pointer' }}>Publish</button>
                            </div>
                        </div>
                    )}

                    {/* List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Loading updates...</div>
                        ) : posts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '80px', background: '#fff', borderRadius: '32px', color: '#94a3b8', border: '1px dashed #e2e8f0' }}>No posts yet.</div>
                        ) : posts.map(post => (
                            <div key={post.id} style={{ 
                                background: '#fff', borderRadius: '28px', border: '1px solid rgba(0,0,0,0.02)', 
                                boxShadow: expandedId === post.id ? '0 20px 40px rgba(0,0,0,0.04)' : '0 4px 12px rgba(0,0,0,0.01)',
                                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                overflow: 'hidden'
                            }}>
                                <div onClick={() => setExpandedId(expandedId === post.id ? null : post.id)} style={{ padding: '28px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#1e293b', letterSpacing: '-0.02em' }}>{post.title}</h3>
                                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '6px', fontWeight: 600 }}>
                                            {post.author} · {post.created_at}
                                        </div>
                                    </div>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: expandedId === post.id ? '#f5f3ff' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: expandedId === post.id ? '#6366f1' : '#94a3b8', transition: 'all 0.3s' }}>
                                        {expandedId === post.id ? "▲" : "▼"}
                                    </div>
                                </div>

                                {expandedId === post.id && (
                                    <div style={{ padding: '0 28px 28px 28px' }}>
                                        <div style={{ height: '1px', background: '#f1f5f9', marginBottom: '20px' }} />
                                        {editingId === post.id ? (
                                            <div>
                                                <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #6366f1', borderRadius: '12px', marginBottom: '12px', fontWeight: 800 }} />
                                                <textarea value={editContent} onChange={e=>setEditContent(e.target.value)} style={{ width: '100%', minHeight: '150px', padding: '12px', border: '1px solid #6366f1', borderRadius: '12px' }} />
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                                                    <button onClick={()=>setEditingId(null)} style={{ padding: '8px 16px', borderRadius: '10px', background: '#f1f5f9', border: 'none', cursor: 'pointer' }}>Cancel</button>
                                                    <button onClick={()=>handleUpdate(post.id)} style={{ padding: '8px 20px', borderRadius: '10px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 800 }}>Save Changes</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <p style={{ margin: 0, fontSize: '1rem', color: '#334155', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>{post.content}</p>
                                                {(isAdmin() || post.author === user?.id) && (
                                                    <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                                        <button onClick={()=> { setEditingId(post.id); setEditTitle(post.title); setEditContent(post.content); }} style={{ padding: '8px 16px', borderRadius: '10px', background: '#f5f3ff', color: '#6366f1', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.8rem' }}>Edit</button>
                                                        <button onClick={()=>handleDelete(post.id)} style={{ padding: '8px 16px', borderRadius: '10px', background: '#fef2f2', color: '#ef4444', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.8rem' }}>Delete</button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
             </div>
             <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
             `}</style>
        </AuthCheck>
    );
}
