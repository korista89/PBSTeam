import React from "react";

export function DashboardSkeleton() {
    return (
        <div className="skeleton-container">
            {/* Header Skeleton */}
            <div className="skeleton" style={{
                height: "60px",
                backgroundColor: "#e5e7eb",
                marginBottom: "20px",
                borderRadius: "8px"
            }} />

            {/* Summary Cards Skeleton */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "20px",
                marginBottom: "30px"
            }}>
                {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton" style={{
                        height: "120px",
                        backgroundColor: "#f3f4f6",
                        borderRadius: "12px"
                    }} />
                ))}
            </div>

            {/* Charts Skeleton */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: "20px"
            }}>
                <div className="skeleton" style={{ height: "300px", backgroundColor: "#f3f4f6", borderRadius: "12px" }} />
                <div className="skeleton" style={{ height: "300px", backgroundColor: "#f3f4f6", borderRadius: "12px" }} />
                <div className="skeleton" style={{ height: "300px", backgroundColor: "#f3f4f6", borderRadius: "12px" }} />
                <div className="skeleton" style={{ height: "300px", backgroundColor: "#f3f4f6", borderRadius: "12px" }} />
            </div>
        </div>
    );
}
