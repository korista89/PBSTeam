"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import styles from "../page.module.css";
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

    // Writing State
    const [isWriting, setIsWriting] = useState(false);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [writeLoading, setWriteLoading] = useState(false);

    // Expanded State
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        try {
            setLoading(true);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            const res = await axios.get(`${apiUrl}/api/v1/board`);
            setPosts(res.data);
        } catch (err) {
            console.error(err);
            setError("게시글을 불러오는데 실패했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const handleWrite = async () => {
        if (!title.trim() || !content.trim()) return;

        try {
            setWriteLoading(true);
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            await axios.post(`${apiUrl}/api/v1/board`, {
                title,
                content,
                author: user?.id + (isAdmin() ? "(관리자)" : "") || "익명"
            });

            setTitle("");
            setContent("");
            setIsWriting(false);
            fetchPosts();
        } catch (err) {
            console.error(err);
            alert("게시글 작성 실패");
        } finally {
            setWriteLoading(false);
        }
    };

    const handleDelete = async (postId: string) => {
        if (!confirm("정말 삭제하시겠습니까?")) return;

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
            await axios.delete(`${apiUrl}/api/v1/board/${postId}`);
            fetchPosts();
        } catch (err) {
            console.error(err);
            alert("삭제 실패");
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    return (
        <AuthCheck>
            <div className={styles.container}>
                <GlobalNav currentPage="board" />
                <main className={styles.main} style={{ marginTop: "20px", maxWidth: "800px", margin: "20px auto" }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <div>
                            <h1 style={{ fontSize: '1.5rem', marginBottom: '5px' }}>📢 공지사항 / 게시판</h1>
                            <p style={{ color: '#666' }}>학교 소식과 공지사항을 확인하세요.</p>
                        </div>

                        {isAdmin() && (
                            <button
                                onClick={() => setIsWriting(!isWriting)}
                                style={{
                                    padding: '10px 20px',
                                    backgroundColor: isWriting ? '#ef4444' : '#6366f1',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                {isWriting ? "취소" : "✏️ 글쓰기"}
                            </button>
                        )}
                    </div>

                    {isWriting && isAdmin() && (
                        <div style={{
                            marginBottom: '30px', padding: '20px',
                            backgroundColor: 'white', borderRadius: '12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                        }}>
                            <h3 style={{ marginTop: 0 }}>새 게시글 작성</h3>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>제목</label>
                                <input
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="제목을 입력하세요"
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                />
                            </div>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>내용</label>
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="내용을 입력하세요..."
                                    rows={5}
                                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                                />
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <button
                                    onClick={handleWrite}
                                    disabled={writeLoading}
                                    style={{
                                        padding: '10px 20px',
                                        backgroundColor: '#10b981',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        opacity: writeLoading ? 0.7 : 1
                                    }}
                                >
                                    {writeLoading ? "저장 중..." : "등록하기"}
                                </button>
                            </div>
                        </div>
                    )}

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>로딩 중...</div>
                    ) : error ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#dc2626' }}>{error}</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {posts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#999', backgroundColor: 'white', borderRadius: '12px' }}>
                                    게시글이 없습니다.
                                </div>
                            ) : (
                                posts.map(post => (
                                    <div key={post.id} style={{
                                        backgroundColor: 'white', borderRadius: '12px',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                        overflow: 'hidden',
                                        border: expandedId === post.id ? '2px solid #6366f1' : '1px solid #e5e7eb',
                                        transition: 'all 0.2s'
                                    }}>
                                        <div
                                            onClick={() => toggleExpand(post.id)}
                                            style={{
                                                padding: '20px', cursor: 'pointer',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                            }}
                                        >
                                            <div>
                                                <h3 style={{ margin: '0 0 5px 0', color: '#1f2937' }}>{post.title}</h3>
                                                <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                                                    {post.author} · {post.created_at}
                                                </div>
                                            </div>
                                            <div style={{ color: '#9ca3af' }}>
                                                {expandedId === post.id ? "▲" : "▼"}
                                            </div>
                                        </div>

                                        {expandedId === post.id && (
                                            <div style={{
                                                padding: '0 20px 20px 20px',
                                                borderTop: '1px solid #f3f4f6',
                                                backgroundColor: '#f9fafb'
                                            }}>
                                                <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', color: '#374151', padding: '20px 0' }}>
                                                    {post.content}
                                                </div>

                                                {isAdmin() && (
                                                    <div style={{ textAlign: 'right', marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #e5e7eb' }}>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(post.id); }}
                                                            style={{
                                                                padding: '6px 12px',
                                                                backgroundColor: '#fee2e2',
                                                                color: '#dc2626',
                                                                border: 'none',
                                                                borderRadius: '4px',
                                                                fontSize: '0.85rem',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            🗑️ 삭제
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </main>
            </div>
        </AuthCheck>
    );
}
