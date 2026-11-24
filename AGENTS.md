# Инструкции по репозиторию

## Запуск и проверка
- **Среда**: Node.js >= 20.6 (используются нативный `fetch` и флаг `node --env-file .env`; пакета `dotenv` нет), CommonJS, Express 5 (`^5.1.0`), фронтенд на Vanilla JS без сборки.
- **Запускать из корня репозитория**: `dir()` в `src/utils/helpers.js` резолвит пути относительно корня проекта, но `node --env-file .env` ищет `.env` относительно текущего `CWD`.
  - Обычный запуск: `npm start` (`PORT` из `.env` или `3000`).
  - Разработка: `npm run dev` (`nodemon` игнорирует `*.db.json`). Конфиг `.vscode/launch.json` вызывает `npm start dev`, что запускает обычный `start`, а не `nodemon`.
- **Тестов, линтера, форматтера и CI нет** — не добавлять тестовые фреймворки и лишние зависимости без явного запроса.
- **Безопасная проверка синтаксиса** (не выполняет модули и не обращается к PERCo API):
  - PowerShell: `Get-ChildItem -Recurse src, static/js -Filter *.js | ForEach-Object { node --check $_.FullName }`
  - POSIX: `node --check src/index.js src/config.js src/controllers/*.js src/routes/*.js src/services/*.js src/utils/*.js static/js/*.js`

## Архитектура и особенности рантайма
- **Побочный эффект при `require()`**: `src/services/percoService.js` экспортирует готовый синглтон `new PercoService()`, который сразу в конструкторе вызывает `init()` — читает `students.db.json`, запускает полную синхронизацию с PERCo-Web (`updateAllData()`) и создаёт `setInterval` на 5 минут. Не импортировать `percoService` / `apiController` / `apiRoutes` / `src/index.js` для пассивных проверок: без валидного `.env` упадёт `src/config.js`, а с ним сразу пойдут боевые запросы и запись на диск.
- **Синхронизация с PERCo-Web (`src/services/percoService.js`, `src/utils/helpers.js`)**:
  - При `HTTP 401` на `/api/sysserver/getServerState` вызывается `POST /api/system/auth`, а новый токен **перезаписывается прямо в `.env`** функцией `updateEnvToken()` (`PERCO_TOKEN=...`, переводы строк приводятся к `LF`).
  - Загружаются активные записи подразделения `division: 5` (`divisions_id.students`), затем пачками по `256` запрашиваются карточки `/api/users/staff/:id`; сохраняются только студенты, у которых в `additional_fields.text` заполнены оба поля: `'Общежитие'` и `'№ комнаты'`.
  - События прохода запрашиваются за последние **14 дней** (`rows: 32000`, зоны `"1, 2"`). Статус определяется по `zone_enter` последнего события: `online` (`"Общежитие №1"`, `"Общежитие №2"`), `offline` (`"Неконтролируемая территория"`), иначе `unknown`; при отсутствии событий за 14 дней статус остаётся не заданным (`null`/не заполнен).
- **Файловый кэш (`src/services/dbService.js`)**: `write()` сначала записывает в `students.db.json` пустой `{}`, затем полный дамп. Пока идёт обновление (`isUpdating === true`), `getStudents()` отдаёт данные из `students.db.json` (с откатом к памяти, если файл пуст).
- **Маршруты и фронтенд**:
  - Валидные маршруты общежитий берутся из `config.properties.hostelMapping`: `/obch1` и `/obch2` (прочие `/:hostel` редиректят на `/`; комментарий про `/moroz, /gorko` в `readme.md` устарел).
  - `src/routes/pagesRoutes.js` вручную подставляет `<script>window.APP_CONFIG = ...</script>` перед `</body>` в `views/monitor.html`.
  - `static/js/studentsRender.js` определяет общежитие из `window.location.pathname.substring(1)` и грузит ассеты по относительным путям `static/...` — страница монитора работает только в корне URL (`/:hostel`). Этаж определяется первым символом номера комнаты (`hostelRoom.charAt(0)`).
  - Клиент опрашивает `GET /api/students?hostel=<slug>` раз в 5 минут, перезагружает страницу раз в 12 часов и **автоматически вызывает `POST /api/students/update`**, если у >90% студентов `currentStatus === null`.

## Секреты и персональные данные (PII)
- Обязательные ключи `.env`: `PERCO_URL`, `PERCO_LOGIN`, `PERCO_PASSWORD`; опциональные: `PORT`, `PERCO_TOKEN`. Никогда не читать и не выводить значения из `.env` в чат, логи, примеры или коммиты.
- Не коммитить `students.db.json` (`*.db.json`), а также отладочные выгрузки (`eventsResponse.json`, `studentsDataDebug.json`) — они содержат реальные ФИО, ID, комнаты и события прохода студентов.

## Git и публикация
- Основная ветка: `main`. Remote `origin` настроен на `fetch` из внутреннего Forgejo и одновременный `push` сразу в два репозитория (два `pushurl`):
  - Forgejo: `http://ivc-dev:8081/adminl/perco-monitor.git` (Git SSH отключён; HTTP-авторизация через глобальный GCM на хост `http://ivc-dev:8081` — не включать `credential.useHttpPath=true`).
  - GitHub (также доступен отдельно как remote `github`): `https://github.com/xenongee/perco-monitor-kat.git`.
- Перед Forgejo на `ivc-dev:8081` стоит `nginx` с лимитом тела запроса **~1 МиБ**: если крупный пуш падает с `RPC failed; HTTP 413`, отправлять коммиты в Forgejo частями меньше 1 МиБ (`git push http://ivc-dev:8081/adminl/perco-monitor.git <sha>:refs/heads/main`, затем обычный `git push`).
