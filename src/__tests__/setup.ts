import dotenv from 'dotenv'
import path from 'path'
import { reloadConfig } from '~/config'

// Получаем путь к корню проекта
// В тестах __dirname может быть не определен, используем process.cwd()
const rootDir = path.resolve(process.cwd())

// Загружаем переменные окружения для тестов
// Сначала .env (основной), потом .env.test (переопределения для тестов)
dotenv.config({ path: path.join(rootDir, '.env') })
dotenv.config({ path: path.join(rootDir, '.env.test') })

// Также загружаем из текущей директории (на случай если запускаем из другой папки)
dotenv.config()

// Устанавливаем ADMIN_TELEGRAM_ID если не установлен (для тестов)
if (!process.env.ADMIN_TELEGRAM_ID) {
  process.env.ADMIN_TELEGRAM_ID = '123456789'
}

// Перезагружаем конфиг после загрузки переменных окружения
// Это нужно, потому что config может быть импортирован до выполнения setup.ts
reloadConfig()

// Проверяем, что ключевые переменные загружены
// (предупреждения убраны для чистоты вывода тестов)

