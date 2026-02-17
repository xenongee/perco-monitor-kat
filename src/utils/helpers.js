const path = require('path');
const fs = require('fs').promises;
const { config, statuses } = require('../config');

/**
 * Форматирование даты в формат `YYYY-MM-DD`
 * @param {*} date
 * @returns
 */
const formatDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Форматирование времени в формат `HH:MM`
 * @param {*} time
 * @returns
 */
const formatTime = (time) => `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

/**
 * Получение абсолютного пути к файлу относительно корня проекта
 * @param {string} _path относительный путь к файлу (например, `./file`, `../static/index.html`)
 * @returns {string} абсолютный путь
 */
const dir = (_path) => path.resolve(__dirname, '..', '..', _path);

/**
 * Извлечение полей общежития из дополнительных полей сотрудника/студента
 * @param {Array} fields массив дополнительных полей
 * @returns {Object} готовый объект с полями общежития
 */
function extractStudentHostelFields(fields) {
    if (!fields) {
        return {};
    }

    return fields.reduce((hostelFieldsAcc, value) => {
        // (value.name === 'Общежитие')
        if (value.name === config.properties.hostel) {
            hostelFieldsAcc.hostel = value?.text || null;
        }
        // (value.name === '№ Комнаты')
        if (value.name === config.properties.room) {
            hostelFieldsAcc.hostelRoom = value?.text || null;
        }

        return hostelFieldsAcc;
    }, {});
}

/**
 * Определение статуса студента по последнему событию
 * @param {Array} zoneEnter массив зон входа
 * @param {Array} zoneExit массив зон выхода
 * @param {Object} lastEvent последнее событие
 */
function determineStudentStatus(zoneEnter, zoneExit, lastEvent) {
    // console.log('    determineStudentStatus - lastEvent:', lastEvent);
    lastZone = lastEvent.to;
    // console.log('    determineStudentStatus - zoneEnter:', zoneEnter);
    // console.log('    determineStudentStatus - zoneExit:', zoneExit);
    // console.log('    determineStudentStatus - lastEvent.to:', lastZone);

    if (zoneEnter.some(zone => zone === lastZone)) {
        return statuses.online;
    }

    if (zoneExit.some(zone => zone === lastZone)) {
        return statuses.offline;
    }

    return statuses.unknown;
}

/**
 * Структурирование списка студентов по этажам и комнатам
 * @param {Array} studentsList массив объектов студентов
 * @returns {Object} структурированные данные по этажам и комнатам
 */
function structureStudentsByFloorAndRooms(studentsList) {
    if (!studentsList) {
        return {};
    }

    const structuredData = studentsList.reduce((acc, student) => {
        // Пропускаем студентов без указанной комнаты
        if (!student.hostelRoom || student.hostelRoom === null) {
            return acc;
        }

        const floor = student.hostelRoom.charAt(0);
        const room = student.hostelRoom;

        // Инициализация структуры
        if (!acc[floor]) acc[floor] = {};
        if (!acc[floor][room]) acc[floor][room] = [];

        acc[floor][room].push(student);
        return acc;
    }, {});

    return structuredData;
}

/**
 * Обновление токена авторизации в файле `.env`
 * @param {string} newToken новый токен авторизации
 */
async function updateEnvToken(newToken) {
    const ENV_PATH = dir('.env');

    try {
        const envContent = (await fs.readFile(ENV_PATH, 'utf-8')).replace(/\r\n/g, '\n');
        const envParams = envContent.split('\n');

        let tokenExist = false;
        const index = envParams.findIndex(line => line.startsWith('PERCO_TOKEN=')); // Находим индекс строки с токеном

        const updatedEnvParams = [...envParams]; // Создаем копию массива

        if (index !== -1) { // Если строка с токеном найдена
            updatedEnvParams[index] = `PERCO_TOKEN=${newToken}`; // Обновляем токен
            tokenExist = true;
        }

        // Старый вариант обновления токена через `map` (не оптимально, так как перебирает все строки)
        // const updatedEnvParams = envParams.map(line => {
        //     if (line.startsWith('PERCO_TOKEN=')) {
        //         tokenExist = true;
        //         return `PERCO_TOKEN=${newToken}`;
        //     }
        //     return line;
        // });

        if (!tokenExist) {
            updatedEnvParams.push(`PERCO_TOKEN=${newToken}`);
        }

        await fs.writeFile(ENV_PATH, updatedEnvParams.join('\n'));

        console.warn('❗ Auth token updated in .env file');
    } catch (e) {
        console.error('❌ Error updating .env file:', e);
    }
}

module.exports = {
    formatDate,
    formatTime,
    dir,
    extractStudentHostelFields,
    determineStudentStatus,
    structureStudentsByFloorAndRooms,
    updateEnvToken
}
