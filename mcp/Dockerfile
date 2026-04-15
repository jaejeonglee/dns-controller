FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
ENV SITEY_API_URL=https://sitey.one
EXPOSE 3000
CMD ["node", "index.js"]
