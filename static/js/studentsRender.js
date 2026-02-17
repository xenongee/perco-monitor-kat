/**
 * Скрипт для отображения списка студентов на странице монитора
 * Обеспечивает обновление данных и рендеринг списка студентов
 */
const statuses = window.APP_CONFIG.statuses;
const state = {
    students: [],
    isLoading: false,
    error: null,
    lastUpdate: null,
    onlineCount: 0,
    offlineCount: 0,
    totalCount: 0,
    hideOffline: false,
    fontSize: 0.8,
}
const studentsListElement = document.querySelector('.students-list');
const studentTemplate = document.querySelector('.student-template');
const sizeTextButton = document.querySelector('.size-text');
const hideOfflineButton = document.querySelector('.hide-offline');
const selectedHostel = window.location.pathname.substring(1);

async function forceUpdate() {
    state.isLoading = true;
    renderMonitor();

    try {
        // Отправляем команду на обновление
        await fetch('/api/students/update', { method: 'POST' });

        // Запоминаем старое время обновления
        const oldLastUpdate = state.lastUpdate ? new Date(state.lastUpdate).getTime() : 0;

        // Ждем, пока данные реально обновятся (максимум 30 секунд)
        let attempts = 0;
        const maxAttempts = 30; // 30 попыток по 1 секунде = 30 секунд

        while (attempts < maxAttempts) {
            await fetchData(); // Получаем текущие данные

            const newLastUpdate = state.lastUpdate ? new Date(state.lastUpdate).getTime() : 0;

            // Если время обновления изменилось - данные обновились!
            if (newLastUpdate > oldLastUpdate) {
                state.error = null;
                break;
            }

            // Ждем 1 секунду перед следующей попыткой
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }

        if (attempts >= maxAttempts) {
            console.warn('⚠️ Данные не обновились за 30 секунд');
        }
    } catch (e) {
        state.error = e;
        console.error(e);
        state.isLoading = false;
        renderMonitor();
        throw e;
    }
}

/**
 * Получение списка студентов по конкретному общежитию
 * Выполняет запрос к API для получения актуальных данных о студентах
 */
async function fetchData() {
    if (!state.isLoading) {
        state.isLoading = true;
        renderMonitor();
    }

    try {
        const dataPath = `/api/students?hostel=${selectedHostel}`;
        const response = await fetch(dataPath);

        if (!response.ok) {
            const error = new Error(`Fetching '${dataPath}' failed: ${response.status} ${response.statusText}`);
            error.statusCode = response.status;
            error.statusText = response.statusText;
            error.details = await response.text();
            throw error;
        }

        const responsePayload = await response.json();

        if (!responsePayload) {
            throw new Error('Invalid responseData structure from server');
        }

        if (!responsePayload.meta || !responsePayload.data) {
            console.warn('!> Invalid response structure:', responsePayload);
            state.error = new Error('Invalid response structure from server');
        } else if (Object.keys(responsePayload.data).length === 0) {
            console.warn('!> No students data received (empty hostel?)');
            state.students = {};
            state.lastUpdate = responsePayload.meta.lastUpdate;
            state.error = null;
        } else {
            state.students = responsePayload.data;
            state.lastUpdate = responsePayload.meta.lastUpdate;
            state.error = null;
        }

        const allStudentsFlat = Object.values(state.students).flatMap(floor => Object.values(floor).flatMap(room => room));
        const nullCount = allStudentsFlat.filter(student => student.currentStatus === null).length;
        const totalCount = allStudentsFlat.length;
        if (totalCount > 0 && (nullCount / totalCount) > 0.9) {
            console.warn(`!> 90% студентов имеет статус 'null' (${nullCount}/${totalCount})`);
            setTimeout(forceUpdate, 1000);
        }

        // console.log(`Updated: ${new Date().toLocaleTimeString()}`);
    } catch (e) {
        state.error = e;
        console.error(e);
    } finally {
        setTimeout(() => {
            state.isLoading = false;
            renderMonitor();
        }, 900);
    }
}

/**
 * Рендер монитора (списка студентов) на основе состояний
 * Обновляет отображение списка студентов в зависимости от текущего состояния
 */
function renderMonitor() {
    const updateButton = document.querySelector('.update-button');
    const lastUpdateElement = document.querySelector('.last-update');
    const studentsCountElement = document.querySelector('.students-count');

    if (state.isLoading) {
        updateButton.classList.add('updating');
    } else {
        updateButton.classList.remove('updating');
    }

    if (state.error) {
        lastUpdateElement.textContent = 'Ошибка получения данных: ' + state.error.message;
        studentsListElement.innerHTML = '';
    } else if (!state.students || Object.keys(state.students).length === 0) {
        lastUpdateElement.textContent = 'Нет данных о студентах';
        studentsCountElement.innerHTML = 'Общежитие пустое или данные загружаются...';
        studentsListElement.innerHTML = '<div style="padding:2em;text-align:center;color:gray">📭 Студентов нет</div>';
    } else {
        lastUpdateElement.innerHTML = state.lastUpdate ? `Последнее обновление: <b>${new Date(state.lastUpdate).toLocaleString()}</b>` : '...';
    }

    state.onlineCount = Object.values(state.students)
        .flatMap(floor => Object.values(floor).flatMap(room => room))
        .filter(student => student.currentStatus === 'online').length;
    state.offlineCount = Object.values(state.students)
        .flatMap(floor => Object.values(floor).flatMap(room => room))
        .filter(student => student.currentStatus === 'offline' ||
            student.currentStatus === null).length;
    state.totalCount = state.students ?
        Object.values(state.students)
            .reduce((acc, floor) => acc + Object.values(floor)
                .reduce((acc, room) => acc + room.length, 0), 0) : 0;

    // const studentStatusNullList = Object.values(state.students)
    //     .flatMap(floor => Object.values(floor).flatMap(room => room))
    //     .filter(student => student.currentStatus === null);
    // if (studentStatusNullList.length >= 1) {
    //     console.log('Students with null status:');
    //     studentStatusNullList.forEach(s => console.log(`- ${s.name} (ID: ${s.id}, status: ${s.currentStatus})`));
    // }

    studentsCountElement.innerHTML = `Общее кол-во: <b>${state.totalCount}</b>. Кол-во в здании: <b>${state.onlineCount}</b>. Не в здании: <b>${state.offlineCount}</b>`;

    if (state.students) {
        renderStudentsList(state.students);
    }
}

/**
 * Формирование и рендер непосредственно самого списка студентов
 * @param {Object} studentsData - данные о студентах, структурированные по этажам и комнатам
 */
function renderStudentsList(studentsData) {
    studentsListElement.innerHTML = '';

    Object.keys(studentsData).forEach(floor => {
        // Create column for each floor
        const colDiv = document.createElement('div');
        colDiv.classList.add('col');

        // Create header for each floor
        const colDivHeader = document.createElement('div');
        colDivHeader.classList.add('col-header');
        colDiv.appendChild(colDivHeader);

        // Create header text
        const colHeader = document.createElement('p');
        colHeader.textContent = `Этаж ${floor}`;
        colDivHeader.appendChild(colHeader);

        // Create body for each floor
        const colDivBody = document.createElement('div');
        colDivBody.classList.add('col-body');
        colDiv.appendChild(colDivBody);

        const rooms = Object.keys(studentsData[floor]);

        rooms.forEach(room => {
            const studentsInRooms = studentsData[floor][room];
            studentsInRooms.forEach(student => {
                // if (student.id == 0) {
                //     console.log(student);
                // }

                const templateContent = studentTemplate.content.cloneNode(true);
                const studentDiv = templateContent.querySelector('.info');

                if (studentsInRooms.length > 1) {
                    // Last Student
                    if (studentsInRooms[studentsInRooms.length - 1].id !== student.id) {
                        studentDiv.style.borderBottomColor = 'var(--color-blue-3)';
                    }
                    // First Student
                    if (studentsInRooms[0].id !== student.id) {
                        // studentDiv.querySelector('.student-room').style.color = 'transparent';
                        studentDiv.querySelector('.student-room').style.color = '#e9e9e9';
                    }

                    if (state.hideOffline && student.currentStatus !== statuses.online) {
                        studentDiv.style.display = 'none';
                    }
                }

                studentDiv.querySelector('.student-room').textContent = student.hostelRoom;
                studentDiv.querySelector('.student-name').textContent = student.name;
                studentDiv.querySelector('.student-name').title = student.name;

                studentDiv.querySelector('.student-name').style.color = 'gray';
                studentDiv.querySelector('.student-status').textContent = '❓';
                // if (student.lastEvent) {
                //     studentDiv.querySelector('.student-status').textContent = '🟡';
                // }
                studentDiv.querySelector('.student-status').setAttribute('status', statuses.unknown);

                const studentLastEvent = student.lastEvent ? `${student?.lastEvent.time} (${student?.lastEvent.from} → ${student?.lastEvent.to}` : 'Неизвестно, данные отсутствуют';

                // studentDiv.querySelector('.student-status').title = `Требуется уточнение местонахождения студента. Последнее зафиксированное событие: ${studentLastEvent}`;
                studentDiv.querySelector('.student-status').setAttribute('data-tooltip', `❓ Статус неизвестен (нет событий за 14 дней). Последнее событие: ${studentLastEvent}`)
                studentDiv.querySelector('.student-status').style.setProperty("--tooltip-adjusted-left", "auto");
                studentDiv.querySelector('.student-status').style.setProperty("--tooltip-adjusted-right", "2em");
                studentDiv.querySelector('.student-status').style.setProperty("--tooltip-adjusted-transform", "none");

                // if (student.name == "fff iii ooo") console.log(`Stud: ${student.name}, Stat: ${student.currentStatus}`);

                if (student.currentStatus === statuses.offline) {
                    studentDiv.querySelector('.student-status').textContent = '🔴';
                    // add atrr
                    studentDiv.querySelector('.student-status').setAttribute('status', statuses.offline);
                    // studentDiv.querySelector('.student-status').title = `Отсувствует – ${studentLastEvent})`;
                    studentDiv.querySelector('.student-status').setAttribute('data-tooltip', `${student.name}: Отсутствует – ${studentLastEvent})`);
                    studentDiv.querySelector('.student-status').style.setProperty("--tooltip-adjusted-left", "auto");
                    studentDiv.querySelector('.student-status').style.setProperty("--tooltip-adjusted-right", "2em");
                    studentDiv.querySelector('.student-status').style.setProperty("--tooltip-adjusted-transform", "none");
                }

                if (student.currentStatus === statuses.online) {
                    studentDiv.querySelector('.student-name').style.color = 'black';
                    studentDiv.querySelector('.student-status').textContent = '🟢';
                    studentDiv.querySelector('.student-status').setAttribute('status', statuses.online);
                    // studentDiv.querySelector('.student-status').title = `Присутствует – ${studentLastEvent})`;
                    studentDiv.querySelector('.student-status').setAttribute('data-tooltip', `${student.name}: Присутствует – ${studentLastEvent})`);
                    studentDiv.querySelector('.student-status').style.setProperty("--tooltip-adjusted-left", "auto");
                    studentDiv.querySelector('.student-status').style.setProperty("--tooltip-adjusted-right", "2em");
                    studentDiv.querySelector('.student-status').style.setProperty("--tooltip-adjusted-transform", "none");
                }

                colDivBody.appendChild(templateContent);
            });
        });

        // Append column to the main container
        studentsListElement.appendChild(colDiv);
    });
}

/**
 * Изменение размера текста в колонках
 */
function changeSizeText() {
    if (state.fontSize < 1.4) {
        state.fontSize += 0.2;
    } else {
        state.fontSize = 0.8; // Reset to default
    }

    // Устанавливаем CSS переменную в :root (<html>)
    document.documentElement.style.setProperty('--student-font-size', `${state.fontSize}em`);

    changeSizeTextUI();

    localStorage.setItem('fontSize', parseFloat(state.fontSize));
}

/**
 * Скрытие оффлайн студентов
 */
function hideOfflineStudents() {
    // Просто меняем флаг в объекте state
    state.hideOffline = !state.hideOffline;

    updateOfflineFilterUI(); // Обновляем UI кнопки
    renderMonitor();       // Перерисовываем список с новым фильтром
}

function updateOfflineFilterUI() {
    const hideIcon = hideOfflineButton.querySelector('.hideStudents');
    const unhideIcon = hideOfflineButton.querySelector('.unhideStudents');

    if (state.hideOffline) {
        hideIcon.classList.add('hidden');
        unhideIcon.classList.remove('hidden');
        hideOfflineButton.setAttribute('data-tooltip', "Показать всех студентов");
    } else {
        hideIcon.classList.remove('hidden');
        unhideIcon.classList.add('hidden');
        hideOfflineButton.setAttribute('data-tooltip', "Скрыть ушедших cтудентов");
    }
}

/**
 * Изменение UI кнопок изменения размера текста
 */
function changeSizeTextUI() {
    const sizePlus = sizeTextButton.querySelector('.sizePlus');
    const sizeMinus = sizeTextButton.querySelector('.sizeMinus');

    if (state.fontSize <= 0.8) {
        sizeMinus.classList.add('hidden');
        sizePlus.classList.remove('hidden');
    } else if (state.fontSize >= 1.4) {
        sizePlus.classList.add('hidden');
        sizeMinus.classList.remove('hidden');
    }

    sizeTextButton.attributes['data-tooltip'].value = `Изменить размер текста: ${state.fontSize}em`;
}

function setupTooltipPosition() {
    document.querySelectorAll('[data-tooltip]').forEach(element => {
        element.addEventListener('mouseenter', function () {
            // Убираем таймер скрытия, если мы снова навели курсор
            if (this.tooltipHideTimer) {
                clearTimeout(this.tooltipHideTimer);
                this.tooltipHideTimer = null;
            }

            setTimeout(() => {
                const tooltipElement = this;
                const tooltipText = this.getAttribute('data-tooltip');

                // Создаем временный элемент для измерения ширины тултипа
                const tempDiv = document.createElement('div');
                tempDiv.style.visibility = 'hidden';
                tempDiv.style.position = 'absolute';
                tempDiv.style.whiteSpace = 'nowrap';
                tempDiv.style.padding = '5px 10px';
                tempDiv.style.fontSize = '1em';
                tempDiv.style.fontFamily = 'Inter';
                tempDiv.textContent = tooltipText;
                document.body.appendChild(tempDiv);

                const tooltipWidth = tempDiv.offsetWidth;
                document.body.removeChild(tempDiv);

                const elementRect = this.getBoundingClientRect();
                const windowWidth = window.innerWidth;

                // Проверяем, выходит ли тултип за границы
                const elementCenter = elementRect.left + elementRect.width / 2;
                const tooltipLeftEdge = elementCenter - tooltipWidth / 2;
                const tooltipRightEdge = elementCenter + tooltipWidth / 2;

                // Если тултип выходит за границы, корректируем позицию
                if (tooltipRightEdge >= windowWidth - 32) {
                    // Выходит за правую границу - двигаем влево
                    this.style.setProperty('--tooltip-adjusted-left', 'auto');
                    this.style.setProperty('--tooltip-adjusted-right', '0');
                    this.style.setProperty('--tooltip-adjusted-transform', 'none');
                } else if (tooltipLeftEdge <= 32) {
                    // Выходит за левую границу - двигаем вправо
                    this.style.setProperty('--tooltip-adjusted-left', '0');
                    this.style.setProperty('--tooltip-adjusted-transform', 'none');
                }
            }, 10);
        });

        element.addEventListener('mouseleave', function () {
            // Ждем завершения анимации исчезновения (300ms как в transition)
            this.tooltipHideTimer = setTimeout(() => {
                // Сбрасываем стили после завершения анимации
                this.style.removeProperty('--tooltip-adjusted-left');
                this.style.removeProperty('--tooltip-adjusted-right');
                this.style.removeProperty('--tooltip-adjusted-transform');
                this.tooltipHideTimer = null;
            }, 300); // Должно совпадать с длительностью transition в CSS
        });
    });
}

function init() {
    // Проверяем сохраненный размер шрифта в localStorage и устанавливаем его, если он существует
    const savedSize = localStorage.getItem('fontSize');
    if (savedSize && savedSize >= 0.8 && savedSize <= 1.4) {
        state.fontSize = parseFloat(savedSize);
        document.documentElement.style.setProperty('--student-font-size', `${state.fontSize}em`);
        changeSizeTextUI();
    }

    setupTooltipPosition();

    // Запускаем интервалы обновления данных и перезагрузки страницы
    setInterval(fetchData, (60 * 1000) * 5); // 5 min
    setInterval(() => window.location.reload(), (60 * 1000) * 60 * 12); // 12 hours

    // Загружаем данные при инициализации
    fetchData();
}

init();
