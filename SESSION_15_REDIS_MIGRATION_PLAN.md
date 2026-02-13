# 🚀 SESSION 15 - REDIS MIGRATION PLAN

**Created:** 2026-02-13
**Status:** Ready for Implementation (Session 16)
**Priority:** MEDIUM (Current 1-instance solution works!)

---

## 📍 CURRENT STATE (Session 15)

### ✅ **WORKING SOLUTION:**
- **In-Memory Sessions** (Map object in Node.js)
- **PM2 Single Instance** (fork mode)
- **15min Session Expiry** with auto-cleanup
- **Polling works perfectly!**

### ⚠️ **LIMITATIONS:**
1. **No Horizontal Scaling** - Stuck with 1 PM2 instance
2. **Session Loss on Restart** - PM2 restart = all sessions gone
3. **No Load Balancing** - Can't distribute across multiple servers

---

## 🎯 REDIS MIGRATION BENEFITS

### **Why Redis?**
- ✅ **Multi-Instance Support** - PM2 Cluster mode (2+ instances)
- ✅ **Persistent Storage** - Survives server restarts
- ✅ **Auto-Expiry** - Redis TTL (Time-To-Live) built-in
- ✅ **High Performance** - In-memory, but persistent
- ✅ **Production Standard** - Used by Uber, Twitter, GitHub

### **Performance:**
- **Read Latency:** <1ms (vs Map: 0ms)
- **Write Latency:** <2ms (vs Map: 0ms)
- **Overhead:** Negligible for our use case!

---

## 📋 IMPLEMENTATION STEPS

### **PHASE 1: Setup Redis (30min)**

#### 1. Install Redis on Hetzner Server
```bash
ssh -i ~/.ssh/vd-hetzner-key root@app.vd.steuerberater-hildebrandt.de

# Install Redis
apt update
apt install -y redis-server

# Configure Redis
nano /etc/redis/redis.conf
# Set: bind 127.0.0.1 (localhost only - security!)
# Set: maxmemory 256mb
# Set: maxmemory-policy allkeys-lru

# Start Redis
systemctl enable redis-server
systemctl start redis-server

# Test Redis
redis-cli ping  # Should return: PONG
```

#### 2. Install Redis Client (Backend)
```bash
cd /root/vd-saas-backend
npm install ioredis
npm install @types/ioredis --save-dev
```

---

### **PHASE 2: Update Backend Code (1h)**

#### 1. Create Redis Service (`src/lib/redis.ts`)
```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

export { redis };
```

#### 2. Update Session Routes (`src/routes/signature-session.routes.ts`)

**BEFORE (In-Memory Map):**
```typescript
const sessions = new Map<string, SessionData>();
```

**AFTER (Redis):**
```typescript
import { redis } from '../lib/redis';

// CREATE Session
router.post('/create', async (req, res) => {
  const sessionId = crypto.randomBytes(16).toString('hex');
  const sessionData = {
    id: sessionId,
    onboardingToken: req.body.onboardingToken,
    completed: false,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    createdAt: new Date(),
  };

  // Store in Redis with 15min TTL
  await redis.setex(
    `session:${sessionId}`,
    15 * 60, // 15 minutes in seconds
    JSON.stringify(sessionData)
  );

  return res.json({ success: true, sessionId, expiresAt: sessionData.expiresAt });
});

// GET Session
router.get('/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId;
  const data = await redis.get(`session:${sessionId}`);

  if (!data) {
    return res.status(404).json({ success: false, error: 'Session nicht gefunden oder abgelaufen' });
  }

  const session = JSON.parse(data);
  return res.json({ success: true, session });
});

// SUBMIT Signature
router.post('/:sessionId/submit', async (req, res) => {
  const sessionId = req.params.sessionId;
  const data = await redis.get(`session:${sessionId}`);

  if (!data) {
    return res.status(404).json({ success: false, error: 'Session nicht gefunden' });
  }

  const session = JSON.parse(data);
  session.signatureData = req.body.signatureData;
  session.completed = true;

  // Update Redis (keep same TTL)
  const ttl = await redis.ttl(`session:${sessionId}`);
  await redis.setex(`session:${sessionId}`, ttl, JSON.stringify(session));

  return res.json({ success: true, message: 'Signatur erfolgreich übertragen' });
});
```

#### 3. Remove Cleanup Interval
```typescript
// DELETE THIS (Redis auto-expires!):
setInterval(() => {
  const now = new Date();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt < now) {
      sessions.delete(id);
    }
  }
}, 60000);
```

---

### **PHASE 3: Update PM2 Config (5min)**

```javascript
// /root/vd-saas-backend/ecosystem.config.js
module.exports = {
  apps: [{
    name: 'vd-saas-backend',
    script: './dist/index.js',
    instances: 2, // ← Back to cluster mode!
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
    },
    // ... rest of config
  }],
};
```

---

### **PHASE 4: Deploy & Test (30min)**

```bash
# Build backend
cd /root/vd-saas-backend
npm run build

# Restart PM2 with new config
pm2 delete all
pm2 start ecosystem.config.js --env production
pm2 save

# Test Redis Sessions
curl -X POST https://app.vd.steuerberater-hildebrandt.de/api/signature-session/create \
  -H "Content-Type: application/json" \
  -d '{"onboardingToken":"test"}'

# Verify in Redis
redis-cli KEYS "session:*"
redis-cli GET "session:XXXXXX"
```

---

## 🔥 BONUS: REDIS ANALYTICS (Optional!)

```typescript
// Track session metrics
await redis.incr('stats:sessions:created');
await redis.incr('stats:sessions:completed');
await redis.hincrby('stats:daily', new Date().toISOString().split('T')[0], 1);

// Get stats
const totalCreated = await redis.get('stats:sessions:created');
const totalCompleted = await redis.get('stats:sessions:completed');
const dailyStats = await redis.hgetall('stats:daily');
```

---

## 📊 COMPARISON: In-Memory vs Redis

| Feature | In-Memory Map | Redis |
|---------|---------------|-------|
| **Performance** | 0ms latency | <1ms latency |
| **Persistence** | ❌ Lost on restart | ✅ Persistent |
| **Multi-Instance** | ❌ Single instance only | ✅ Cluster mode |
| **Auto-Expiry** | Manual cleanup | Built-in TTL |
| **Memory Usage** | ~5KB per session | ~5KB per session |
| **Scalability** | Limited to 1 server | Multi-server ready |
| **Setup Time** | 0 min | 30 min |
| **Complexity** | Low | Medium |

---

## ⚡ MIGRATION CHECKLIST

- [ ] Install Redis on server
- [ ] Configure Redis (bind localhost, maxmemory)
- [ ] Install `ioredis` package
- [ ] Create `src/lib/redis.ts`
- [ ] Update `signature-session.routes.ts`
- [ ] Remove cleanup interval
- [ ] Update PM2 config (2 instances)
- [ ] Test session creation
- [ ] Test session retrieval
- [ ] Test session submission
- [ ] Test multi-instance load balancing
- [ ] Monitor Redis memory usage
- [ ] Update documentation

---

## 🚨 ROLLBACK PLAN

**If Redis fails:**
```bash
# Stop PM2
pm2 delete all

# Restore old code (git revert)
cd /root/vd-saas-backend
git checkout HEAD~1  # Go back 1 commit

# Rebuild
npm run build

# Restart with 1 instance
pm2 start dist/index.js --name vd-saas-backend
pm2 save
```

**Downtime:** <2 minutes

---

## 💡 ALTERNATIVE: PostgreSQL Sessions

**Instead of Redis, use existing Prisma DB:**

**Pros:**
- ✅ No new dependency
- ✅ Already have PostgreSQL
- ✅ Persistent + Multi-instance

**Cons:**
- ❌ Slower (10-20ms latency)
- ❌ DB overhead
- ❌ Manual cleanup cron needed

**Schema:**
```prisma
model SignatureSession {
  id              String   @id
  onboardingToken String
  signatureData   String?
  completed       Boolean  @default(false)
  expiresAt       DateTime
  createdAt       DateTime @default(now())

  @@index([expiresAt])
}
```

**NOT RECOMMENDED** - Redis is better for sessions!

---

## 📅 TIMELINE

**Recommended Schedule:**
- **Session 16:** Redis Migration (2h)
- **Session 17:** Analytics Dashboard (use Redis stats!)
- **Session 18:** Multi-Server Deployment (if needed)

**Current Status:** ✅ Working perfectly with 1 instance!
**Urgency:** LOW (migrate when traffic grows)

---

**Last Updated:** 2026-02-13 16:40 UTC
**Author:** Claude Sonnet 4.5 (Session 15)
