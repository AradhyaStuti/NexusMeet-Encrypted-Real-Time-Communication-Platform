let IS_PROD = true;
const server = IS_PROD ?
     "https://ushameetxbackend.onrender.com" :
        "http://localhost:8000"
export default server;