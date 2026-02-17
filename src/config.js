/**
 * Конфигурационный файл приложения
 * Содержит настройки подключения к PERCo-Web API и другие параметры
 */
const { env } = require('node:process');

const hostelMapping = {
    obch1: "Общежитие №1",
    obch2: "Общежитие №2"
};

const config = {
    port: env.PORT || 3000,
    perco: {
        url: env.PERCO_URL,
        login: env.PERCO_LOGIN,
        password: env.PERCO_PASSWORD,
        token: env.PERCO_TOKEN,
    },
    properties: {
        hostelMapping, //additional_fields
        zones: { //zone
            ids: "1, 2",
            enter: Object.values(hostelMapping),
            exit: ["Неконтролируемая территория"]
        },
        divisions_id: { //division
            students: 5,
            ochnoeOtdelenie: 10,
            obchezhitie2: 80
        },
        hostel: 'Общежитие', //additional_fields
        room: '№ комнаты', //additional_fields
    }
};

const statuses = {
    online: 'online',
    offline: 'offline',
    unknown: 'unknown'
}

if (
    !config.perco.url ||
    !config.perco.login ||
    !config.perco.password
) {
    throw new Error('❌ | Missing PERCo credentials in .env file');
}

module.exports = { config, statuses };
