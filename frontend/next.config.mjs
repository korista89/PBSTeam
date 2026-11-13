/** @type {import('next').NextConfig} */
const nextConfig = {
    poweredByHeader: false,
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    // 보안 헤더: 다른 사이트가 이 화면을 몰래 감싸는 것(클릭재킹)·형식 추측·주소 유출을 막는다.
    // 같은 사이트 안의 iframe(미리보기)은 SAMEORIGIN/frame-ancestors 'self' 로 계속 허용된다.
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    { key: "X-Frame-Options", value: "SAMEORIGIN" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
                    { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'" },
                ],
            },
        ];
    },
    // Local dev only: frontend (:3000) and backend (:8000) are separate servers,
    // unlike production where vercel.json routes /api/* to the backend on the same domain.
    // Without this, every relative "/api/v1/..." call (login included) 404s locally.
    // 옛 주소(개별행동중재계획)는 대시보드·행동중재 화면으로 합쳐졌다.
    async redirects() {
        return [{ source: "/report/tier3", destination: "/target-behavior", permanent: false }];
    },
    async rewrites() {
        if (process.env.NODE_ENV !== "development") return [];
        return [
            { source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" },
        ];
    },
};

export default nextConfig;
