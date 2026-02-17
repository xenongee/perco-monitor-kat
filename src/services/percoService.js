const config = require('../config').config;
const helper = require('../utils/helpers');
const dbService = require('./dbService');

class PercoService {
    /**
     * Класс для работы с API PERCo-Web
     * Отвечает за получение данных о студентах, их статусах и событиях прохода
     */
    constructor () {
        this.apiUrl = config.perco.url;
        this.login = config.perco.login;
        this.password = config.perco.password;
        this.token = config.perco.token;
        // this.token = config.perco.tokenTest;
        this.tokenLastCheckTime = 0;
        this.zones = config.properties.zones;
        this.divisions_id = config.properties.divisions_id;

        this.studentsData = new Map();
        this.isUpdating = false;
        this.lastSuccessfulUpdate = null;
        this.daysToCheck = 14;

        this.init();
    }

    /**
     * Инициализация данных из файла и запуск фонового обновления
     * Загружает предыдущие данные о студентах из файла и запускает процесс обновления
     */
    async init() {
        this.studentsData = await dbService.read();
        console.log(`✅ Previous students data loaded from file. Total students: ${this.studentsData.size}`);

        // const DIVISION = await this._fetch('GET', '/api/divisions/list');
        // console.log(DIVISION);

        const fileStat = await dbService.getStat().catch(() => null);

        if (fileStat) {
            this.lastSuccessfulUpdate = fileStat.mtime;
        }

        this.updateAllData();

        const UPDATE_INTERVAL = 5 * 60 * 1000;
        setInterval(() => this.updateAllData(), UPDATE_INTERVAL);
    }

    /**
     * Возвращает время последнего успешного обновления данных
     * @returns {Date} Время обновления данных или null, если обновление еще не происходило
     */
    getLastUpdateTime() {
        return this.lastSuccessfulUpdate;
    }

    /**
     * Отправка запросов к API PERCo-Web
     * @param {string} method - HTTP метод (GET, POST, PUT, DELETE)
     * @param {string} apiPath - Путь к API endpoint
     * @param {Object} queryParams - Параметры запроса
     * @param {Object} headers - Заголовки запроса
     * @param {Object} body - Тело запроса
     * @returns {Promise<Object>} Ответ от API в формате JSON
     * @throws {Error} Ошибка при выполнении запроса
     */
    async _fetch(
        method = 'GET',
        apiPath,
        queryParams = {},
        headers = { 'Authorization': `Bearer ${this.token}` },
        body = null
    ) {
        const url = new URL(this.apiUrl);
        url.pathname = apiPath;
        headers = {
            'Content-Type': 'application/json',
            ...headers,
        }

        // Добавляем параметры запроса
        for (const key in queryParams) { url.searchParams.set(key, queryParams[key]); }

        const response = await fetch(url.href, {
            method: method,
            headers: headers,
            body: method !== 'GET' && method !== 'HEAD' ? JSON.stringify(body) : null, // Добавляем тело запроса только для методов, которые его поддерживают
        }).catch((error) => {
            throw new Error(`❌ Fetching '${apiPath}' failed: ${error.message}`);
        });

        if (!response.ok) {
            const responseText = await response.text();
            let responseBody = {};

            try {
                responseBody = JSON.parse(responseText);
            } catch (e) {
                responseBody = { raw: responseText }
            }

            const error = new Error(`❌ Fetching '${apiPath}' failed: ${response.status} ${response.statusText}`);

            error.status = response.status;
            error.statusText = response.statusText;
            error.responseBody = responseBody;

            if (response.status === 401) {
                error.isAuthError = true;
                console.log("❌ PERCo-Web auth error");
            }

            throw error;
        }

        // console.log(`💬 Fetched '${apiPath}'`);

        return response.json();
    }

    /**
     * Проверка состояния сервера PERCo-Web и актуальности токена
     * Проверяет доступность сервера и обновляет токен авторизации при необходимости
     */
    async _checkServerStateAndToken() {
        try {
            const percoStateResponse = await this._fetch('GET', '/api/sysserver/getServerState');
            percoStateResponse;
            // if (percoStateResponse.color === 1 && percoStateResponse.state === "SYSTEM_SERVER_WORKS") {
                // console.log("✅ PERCo-Web server state - OK");
            // }
        } catch (e) {
            if (e.isAuthError) {
                console.warn('❗ PERCo-Web token expired. Getting new token...');
                await this._getNewToken();
            }

            console.error('❌ PERCo-Web server state - ERROR', e.message);
        }
    }

    /**
     * Получение токена авторизации в PERCo-Web
     * Выполняет аутентификацию и получает новый токен для работы с API
     */
    async _getNewToken() {
        const percoTokenResponse = await this._fetch(
            'POST',
            '/api/system/auth',
            {},
            {},
            { 'login': this.login, 'password': this.password }
        );

        this.token = percoTokenResponse.token; // Обновляем токен в экземпляре класса
        console.warn('❗ New Auth token created');

        await helper.updateEnvToken(this.token); // Обновляем токен в файле .env
    }

    /**
     * Получение информации о всех студентах
     * Запрашивает список всех студентов и получает дополнительную информацию о каждом
     * @returns {Promise<Array>} Массив объектов с информацией о студентах
     */
    async _getAllStudentsInfo() {
        const studentsListResponse = await this._fetch(
            'GET',
            '/api/users/staff/fullList',
            {
                division: this.divisions_id.students,
                status: 'active'
            }
        );

        // console.debug(studentsListResponse.filter(stud => stud.id === 326));

        // Базовый список студентов
        const studentsListRawData = studentsListResponse.map(row => ({
            id: row.id,
            // name: row.name,
            name: row.last_name + ' ' + row.first_name + ' ' + row.middle_name,
            division: [row.division_id, row.division_name]
        }));

        // Пакетное получение дополнительных сведений о каждом студенте
        const BATCH_SIZE = 256;
        let studentsListData = [];

        for (let i = 0; i < studentsListRawData.length; i += BATCH_SIZE) {
            const batch = studentsListRawData.slice(i, i + BATCH_SIZE);
            const batchData = await Promise.all(batch.map(async (element) => {
                try {
                    const studentDataResponse = await this._fetch('GET', `/api/users/staff/${element.id}`);

                    // For Debug:
                    // if (studentDataResponse.id === 'student id') {
                    //     console.log(studentDataResponse);
                    //     console.log(studentDataResponse.additional_fields.text);
                    // };

                    const studentHostelFields = helper.extractStudentHostelFields(studentDataResponse.additional_fields.text);

                    // Если у студента нет общежития и комнаты - пропускаем
                    if (studentHostelFields.hostel === null || studentHostelFields.hostelRoom === null) {
                        return null;
                    }

                    return {
                        ...element,
                        ...studentHostelFields
                    };
                } catch (e) {
                    console.error(`❌ Failed to fetch data for student ID ${element.id}:`, e.message);
                    return null;
                }
            }));

            // Добавляем результаты успешной обработки пачки в общий список
            studentsListData.push(...batchData);
        }

        // Убираем null значения (те, что были в кэше как не-студенты или не в общежитии, и те, что упали с ошибкой)
        studentsListData = studentsListData.filter(Boolean);

        console.log(`  🔸 Total students in all hostels: ${studentsListData.length}`);

        return studentsListData;
    }

    /**
     * Получает все события прохода и находит последнее для каждого пользователя.
     * @returns {Map<number, object>} - Map, где ключ - user_id, значение - объект последнего события.
     */
    async _processLastEvents() {
        const rowsCount = 32000;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - this.daysToCheck);

        console.log(`  🔸 Date start: ${helper.formatDate(startDate)}`);
        console.log(`  🔸 Date end: ${helper.formatDate(endDate)}`);
        console.log(`  🔸 Max count of events rows: ${rowsCount}`);

        // Получаем все события
        const eventsResponse = await this._fetch(
            'GET',
            '/api/accessReports/events',
            {
                dateBegin: helper.formatDate(startDate),
                dateEnd: helper.formatDate(endDate),
                sidx: "time_label",
                sord: "desc",
                division: this.divisions_id.students,
                rooms: config.properties.zones.ids,
                // rows: 10000 // Запрашиваем с большим запасом, чтобы получить все события
                rows: rowsCount
            }
        );

        const lastEvents = new Map();
        if (!eventsResponse || !eventsResponse.rows) return lastEvents;

        // Сохранить список событий в JSON для дебаггинга
        // require('fs').writeFileSync('eventsResponse.json', JSON.stringify(eventsResponse.rows, null, 2));

        // Сортируем все события по времени от старых к новым, чтобы последнее событие перезаписало предыдущие
        const sortedEvents = eventsResponse.rows.sort((a, b) => new Date(a.time_label) - new Date(b.time_label));

        // console.debug(sortedEvents.rows);

        // Находим последнее событие для каждого пользователя и перезаписываем его в мапу
        for (const event of sortedEvents) {
            lastEvents.set(event.user_id, event);
        }

        console.log(`  🔸 Processed ${eventsResponse.rows.length} events rows, found last events for ${lastEvents.size} unique users.`);
        return lastEvents;

    }

    /**
     * Обновление всех данных о студентах
     * Выполняет полное обновление данных: получает информацию о студентах,
     * их событиях прохода и обновляет статусы
     */
    async updateAllData() {
        if (this.isUpdating) {
            console.log('⚠️ Update already in progress. Skipping...');
            return;
        }

        this.isUpdating = true;
        console.log('⏳ Starting update...');

        try {
            // Проверяем состояние сервера и токена раз в сутки
            if ((Date.now() - this.tokenLastCheckTime) > 24 * 60 * 60 * 1000) {
                this.tokenLastCheckTime = Date.now();
            }
            await this._checkServerStateAndToken();

            // Получаем данные о всех студентах
            const allStudentsInfo = await this._getAllStudentsInfo();

            // // Фильтруем студентов, у которых есть данные об общежитии и комнате
            // const filteredStudents = allStudentsInfo.filter(student =>
            //     student.hostel && student.hostelRoom && student.hostel !== null && student.hostelRoom !== null
            // )

            // Получаем список всех ID студентов из мапы studentsData
            const existingStudentsIDs = new Set(this.studentsData.keys());

            // Обновляем данные в studentsData
            allStudentsInfo.forEach(student => {
                const existEntry = this.studentsData.get(student.id) || {};

                this.studentsData.set(student.id, {
                    ...existEntry,
                    id: student.id,
                    name: student.name,
                    hostel: student.hostel,
                    hostelRoom: student.hostelRoom,
                    // currentStatus: null
                });

                // Удаляем ID студента из множества, так как он существует в данных
                existingStudentsIDs.delete(student.id);
            });

            // Удаляем данные о студентах, которых больше нет в allStudentsInfo (например, если студент был отчислен, переведен из общежития и т.п.)
            existingStudentsIDs.forEach(studentID => this.studentsData.delete(studentID));

            // Получаем события за последний день и вычисляем последние события для каждого студента
            const lastEvents = await this._processLastEvents();

            // Обновляем статус студентов на основе последних событий
            for (const [id, event] of lastEvents.entries()) {
                const studentEntry = this.studentsData.get(id);
                if (studentEntry) {
                    studentEntry.lastEvent = {
                        time: event.time_label,
                        from: event.zone_exit,
                        to: event.zone_enter,
                    };

                    studentEntry.currentStatus = helper.determineStudentStatus(this.zones.enter, this.zones.exit, studentEntry.lastEvent);

                    // For Debug:
                    // if (id === 'student id') {
                    //     console.log(`Student: ${id}`)
                    //     console.log(`Event: ${event}`)
                    //     console.log(`Status: ${studentEntry.currentStatus}`)
                    // }
                }
            }

            // For Debug:
            // Удаляем студентов, у которых нет последнего события
            // for (const [id, student] of this.studentsData.entries()) {
            //     if (!student.lastEvent) {
            //         this.studentsData.delete(id);
            //     }
            // }

            // Сохраняем обновленный лог в файл
            await dbService.write(this.studentsData);
            this.lastSuccessfulUpdate = new Date();

            let nullCount = 0;
            for (const student of this.studentsData.values()) {
                if (student.currentStatus === null) nullCount++;
            }

            console.log(`✅ Update finished. -> 'null' status: ${nullCount}/${this.studentsData.size} (~${Math.round(nullCount / this.studentsData.size * 100)}%)`);

            console.log("");

        } catch (e) {
            console.error('❌ An error occurred during full data update:', e);
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Возвращает список студентов для указанного общежития.
     * Данные берутся из актуального кэша в памяти.
     * @param {string} hostelName - Название общежития
     * @returns {Promise<Array<object>>}
     */
    async getStudents(hostelName) {
        let studentsDataArray = [];

        if (this.isUpdating) {
            console.log(`-> Update in progress for ${hostelName}, serving from DB cache...`);

            try {
                const cachedStudentsData = await dbService.read();
                studentsDataArray = Array.from(cachedStudentsData.values());

                if (studentsDataArray.length === 0 && this.studentsData.size > 0) {
                    console.log(`   📭 DB empty, using memory (${this.studentsData.size} students)`);
                    studentsDataArray = Array.from(this.studentsData.values());
                }
            } catch (e) {
                console.warn(`   ❌ DB read failed: ${e.message}, using memory`);
                studentsDataArray = Array.from(this.studentsData.values());
            }
        } else {
            studentsDataArray = Array.from(this.studentsData.values());
        }

        // Фильтрация по общежитию
        let formatedStudentData = studentsDataArray.filter(student => student.hostel === hostelName);
        console.log(`🔹 Total students in ${hostelName} hostel: ${formatedStudentData.length}`);

        // For Debug:
        // require('fs').writeFileSync('studentsDataDebug.json', JSON.stringify([formatedStudentData.length, formatedStudentData], null, 2));

        return formatedStudentData;
    }

    // TEMP:
    // async updateFromHandler(req) {
    //     console.log(req);

    //     console.log(`⚡️ Update request received from ${req.ip}`);
    // }
}

// Экспортируем экземпляр класса PercoService (это синглтон, т.е. один единственный экземпляр класса
// на весь проект, глобальная точка). Экспортируем не сам класс (чертеж), а уже готовый объект (дом)
module.exports = new PercoService();
