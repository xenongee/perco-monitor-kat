/**
 * Главная точка входа в приложение
 * Запускает Express сервер и подключает все необходимые middleware и маршруты
 */
const { dir } = require('./utils/helpers');
const apiRouter = require('./routes/apiRoutes');
const pagesRouter = require('./routes/pagesRoutes');
const express = require('express');
const { config } = require('./config');
const app = express();

app.use(express.json());

// Подключение статических файлов, которые будут доступны по маршруту /static
app.use("/static", express.static(dir('static'), {
    maxAge: 0,
    etag: false,
    setHeaders: (res, path) => {
        if (path.endsWith('.woff2')) {
            res.set('Content-Type', 'font/woff2');
        } else if (path.endsWith('.ico')) {
            res.set('Content-Type', 'image/x-icon');
        }
    }
}));

// Подключение маршрутов API этого приложения
app.use('/api', apiRouter);

// Подключение маршрутов страниц
app.use('/', pagesRouter);

app.listen(config.port, () => {
    console.log(`✅ Server is running at http://localhost:${config.port}`);
});
