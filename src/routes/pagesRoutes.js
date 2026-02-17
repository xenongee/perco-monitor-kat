/**
 * Роуты для страниц приложения
 * Обрабатывают запросы к страницам приложения
 */
const { route } = require('./apiRoutes');
const { dir } = require('../utils/helpers');
const { config, statuses } = require('../config');
const fs = require('fs').promises;
const express = require('express');

// Создание роутера для страниц этого приложения
const routes = express.Router();

// Роут на страницу монитора общежития
routes.get('/:hostel', async (req, res, next) => {
    // if (req.params.hostel === 'moroz' || req.params.hostel === 'gorko') {
    if (config.properties.hostelMapping[req.params.hostel]) {
        try {
            let htmlContent = await fs.readFile(dir('views/monitor.html'), 'utf8');
            const clientConfig = { statuses: statuses };

            const injectScript = `
                <script type="text/javascript">
                    window.APP_CONFIG = ${JSON.stringify(clientConfig)};
                </script>
            `
            htmlContent = htmlContent.replace('</body>', `${injectScript}</body>`);

            res.send(htmlContent);
        } catch (e) {
            next(e);
        }
    } else {
        res.redirect('/');
    }
});

// Корневой роут на страницу выбора общежития
routes.get('/', (_, res) => {
    res.sendFile(dir('views/index.html'));
});

module.exports = routes;
