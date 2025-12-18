import { Bot } from 'grammy';
import { config } from '../config';
import { logToTelegram, setBotInstance } from '../utils/logger';

export async function createBot(): Promise<Bot> {
  const bot = new Bot(config.telegram.botToken);

  // Set bot instance for logger
  setBotInstance(bot);

  // Basic commands
  bot.command('start', async ctx => {
    await ctx.reply('Привет! Я бот для управления платежами за сквош-занятия.');
    await logToTelegram(`User ${ctx.from.id} started the bot`, 'info');
  });

  bot.command('help', async ctx => {
    const helpText = `
Доступные команды:

/scaffold add <day> <time> <courts> - создать шаблон занятия
/scaffold list - список шаблонов
/scaffold toggle <id> - включить/выключить шаблон
/scaffold remove <id> - удалить шаблон

/event add <date> <time> <courts> - создать занятие
/event list - список занятий
/event announce <id> - анонсировать занятие
/event cancel <id> - отменить занятие

/my history <filter> - моя история
/my debt - мой долг

/admin debts - список должников
/admin history @username <filter> - история пользователя
/admin repay @username <amount> - погасить долг

/test * - тестовые команды (только в тестовом чате)
    `.trim();

    await ctx.reply(helpText);
    await logToTelegram(`User ${ctx.from.id} requested help`, 'info');
  });

  // Error handling
  bot.catch(err => {
    const error = err.error;
    logToTelegram(`Bot error: ${error.message}\n${error.stack}`, 'error');
    console.error('Bot error:', error);
  });

  await logToTelegram('Bot started successfully', 'info');

  return bot;
}
