const server = process.env.NODE_ENV === "production"
    ? ""
    : "http://localhost:8000";

export default server;
