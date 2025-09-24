# ---------- Build Stage ----------
FROM node:20-alpine AS build

# Set working dir inside container
WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package*.json ./

# Install all deps (including dev so prisma can generate)
RUN npm ci

# Copy the rest of your source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# ---------- Runtime Stage ----------
FROM node:20-alpine

WORKDIR /app

# Only copy production deps + built prisma client
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/package*.json ./

# Set environment variable for production
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port your app listens on
EXPOSE 3000

# Start the app
CMD ["node", "src/index.js"]
