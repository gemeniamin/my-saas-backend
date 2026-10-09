const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const JWT_SECRET = 'super_secret_saas_key_2026';

// ------------------- ПОДКЛЮЧЕНИЕ К BAZE DANNЫХ -------------------
// ⚠️ НЕ ЗАБУДЬТЕ закрепить ваш настоящий пароль вместо ВАШ_ПАРОЛЬ!
const MONGO_URI = 'mongodb+srv://admin:pass123@cluster0.cl271cb.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB успешно подключена'))
    .catch(err => console.error('❌ Ошибка подключения к БД:', err));

// ------------------- БАЗА ДАННЫХ (SCHEMAS) -------------------
const UserSchema = new mongoose.Schema({
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    plan: { type: String, default: 'free' }, // free, pro, business
    subscriptionUntil: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

const SiteSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    domain: String,
    tgToken: String,
    analytics: { views: { type: Number, default: 0 }, leads: { type: Number, default: 0 } },
    content: Object
});

const User = mongoose.model('User', UserSchema);
const Site = mongoose.model('Site', SiteSchema);

// ------------------- MIDDLEWARE (АВТОРИЗАЦИЯ) -------------------
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Доступ запрещен' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Недействительный токен' });
        req.user = user;
        next();
    });
};

// ------------------- API ЭНДПОИНТЫ -------------------

// 1. Регистрация нового клиента SaaS
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword });
        await user.save();
        
        const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET);
        res.json({ success: true, token, plan: user.plan });
    } catch (e) {
        res.status(400).json({ error: 'Пользователь уже существует' });
    }
});

// 2. Вход в личный кабинет
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ error: 'Неверный логин или пароль' });
    }
    const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET);
    res.json({ success: true, token, plan: user.plan });
});

// 3. Создание клиентского сайта/бота
app.post('/api/sites/create', authenticateToken, async (req, res) => {
    const { title, domain, content, tgToken } = req.body;
    const site = new Site({
        userId: req.user.userId,
        title,
        domain,
        content,
        tgToken
    });
    await site.save();
    res.json({ success: true, siteId: site._id });
});

// 4. Получение аналитики и списка проектов пользователя
app.get('/api/dashboard', authenticateToken, async (req, res) => {
    const sites = await Site.find({ userId: req.user.userId });
    const user = await User.findById(req.user.userId);
    res.json({ user, sites });
});

// 5. Монетизация: Оплата подписки PRO
app.post('/api/subscribe', authenticateToken, async (req, res) => {
    const { plan } = req.body;
    const until = new Date();
    until.setMonth(until.getMonth() + 1);

    await User.findByIdAndUpdate(req.user.userId, { plan, subscriptionUntil: until });
    res.json({ success: true, message: `Подписка ${plan.toUpperCase()} активирована!` });
});

// Запуск сервера
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 SaaS Backend запущен на порту ${PORT}`));