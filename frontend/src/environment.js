const server = process.env.NODE_ENV === "production"
    ? "https://ushameetxbackend.onrender.com"
    : "http://localhost:8000";

export default server;
