const percoService = require('../services/percoService');
const helper = require('../utils/helpers');
const { config } = require('../config');

/**
 * Обновление и получение списка студентов по общежитию
 * @param {Object} req - объект запроса Express
 * @param {Object} res - объект ответа Express
 */
async function getStudentsByHostel(req, res) {
    try {
        const hostelName = config.properties.hostelMapping[req.query.hostel];

        if (!hostelName) {
            return res.status(400).send({ message: '❌ Unknown hostel.' });
        }

        const studentData = await percoService.getStudents(hostelName);
        const lastUpdate = percoService.getLastUpdateTime();
        const responsePayload = {
            meta: {
                lastUpdate: lastUpdate,
                hostel: hostelName
            },
            data: helper.structureStudentsByFloorAndRooms(studentData)
        };

        // const response = helper.structureStudentsByFloorAndRooms(studentList);

        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        res.json(responsePayload);
    } catch (e) {
        console.error(e);

        if (!res.headersSent) {
            res.status(e.status || 500).send({
                message: e.message || 'Unknown error occurred.',
                stack: e.stack || 'No stack trace available.'
            });
        }
    }
}

/**
 * Функция для принудительного обновления данных о студентах
 * @param {*} _ просто пустой параметр, чтобы соответствовать сигнатуре функции
 * @param {*} res объект ответа Express
 */
async function forceUpdate(_, res) {
    percoService.updateAllData();
    res.status(202).json({ message: '✅ Update started in background.' });
}

// TEMP:
// async function handleEvent (req, res) {
//     percoService.updateFromHandler(req.body);
//     res.status(202).json({ message: '✅ Event handled.' });
// }

// Экспортируем функцию для получения списка студентов по общежитию
module.exports = { getStudentsByHostel, forceUpdate };
