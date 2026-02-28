FROM node:22-slim

WORKDIR /app

# 安装构建 better-sqlite3 所需的依赖
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# 复制依赖文件并安装
COPY package.json package-lock.json ./
RUN npm ci

# 复制源代码并构建
COPY . .
RUN npm run build

# 创建数据目录
RUN mkdir -p data

# 暴露端口
EXPOSE 3001

ENV PORT=3001
ENV NODE_ENV=production

# 启动 Express 服务器（同时托管前端和后端）
CMD ["node", "dist-server/index.js"]
