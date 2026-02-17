/**
 * Сервис для работы с файлом базы данных
 * Обеспечивает чтение и запись данных о студентах в файл students.db.json
 */
const fs = require('fs').promises;
const { dir } = require('../utils/helpers');

const DB_PATH = dir('students.db.json');

class DBService {
    /**
     * Запись данных о студентах в файл
     * @param {Map} studentsDataMap - Map с данными о студентах
     */
    async write(studentsDataMap) {
        const studentsObject = Object.fromEntries(studentsDataMap);
        await fs.writeFile(DB_PATH, JSON.stringify({})); // clear
        await fs.writeFile(DB_PATH, JSON.stringify(studentsObject, null, 2));
    }

    /**
     * Чтение данных о студентах из файла
     * @returns {Promise<Map>} Map с данными о студентах
     */
    async read() {
        try {
            const studentsData = (await fs.readFile(DB_PATH, 'utf-8')).replace(/\r\n/g, '\n');
            if (studentsData.trim() === '') {
                return new Map();
            }
            const studentsObject = JSON.parse(studentsData);
            return new Map(Object.entries(studentsObject).map(([key, value]) => [Number(key), value]))
        } catch (e) {
            if (e.code === 'ENOENT') {
                return new Map();
            }
            throw e;
        }
    }

    /**
     * Получение сведений о файле базы данных для сверки времени создания
     */
    async getStat() {
        try {
            return await fs.stat(DB_PATH);
        } catch (e) {
            if (e.code === 'ENOENT') return null;
            throw e;
        }
    }
}

// Экспортируем экземпляр класса (синглтон)
module.exports = new DBService();
