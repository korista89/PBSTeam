/** @type {import('next').NextConfig} */
const nextConfig = {
    poweredByHeader: false,
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    // Local dev only: frontend (:3000) and backend (:8000) are separate servers,
    // unlike production where vercel.json routes /api/* to the backend on the same domain.
    // Without this, every relative "/api/v1/..." call (login included) 404s locally.
    async rewrites() {
        if (process.env.NODE_ENV !== "development") return [];
        return [
            { source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" },
        ];
    },
};

export default nextConfig;
