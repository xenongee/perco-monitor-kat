/**
 * Роуты для API приложения
 * Обрабатывают запросы к API для получения и обновления данных о студентах
 */
const express = require('express');
const apiController = require('../controllers/apiController');

// Создание роутера для API этого приложения
const apiRouter = express.Router();

// Редирект на главную страницу при обращении к корневому маршруту API
apiRouter.get('/', (_, res) => {
    res.redirect('/');
});

// Получение списка студентов через контроллер API этого приложения
apiRouter.get('/students', (req, res) => {
    apiController.getStudentsByHostel(req, res);
});

// Принудительное обновление данных о студентах через контроллер API этого приложения
apiRouter.post('/students/update', async (_, res) => {
    apiController.forceUpdate(_, res);
});

// TEMP:
// apiRouter.post('/event', async (req, res) => {
//     apiController.handleEvent(req, res);
// });

// Экспорт роутера для использования в основном приложении
module.exports = apiRouter;
