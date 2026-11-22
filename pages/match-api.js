// Keep HTTP failures distinct from transport failures without exposing server details.
export function createMatchApi(client, now = () => performance.now()) {
  return async body => {
    const started = now();
    const { data, error } = await client.functions.invoke('matchplay', { body, timeout:12000 });
    if (error || data?.error) {
      const failure = new Error('Matchplay request failed');
      const status = error?.context?.status;
      if (Number.isInteger(status)) failure.status = status;
      throw failure;
    }
    if (data?.game) data.game = {...data.game, _clock_age_ms:Math.max(0, (now() - started) / 2)};
    return data;
  };
}

export function retryMessage(error, fallback) {
  if (error?.status === 401 || error?.status === 403) return 'Не удалось подтвердить сессию. Повторяем попытку…';
  if (error?.status === 429) return 'Сервис временно ограничил запросы. Повторяем попытку…';
  if (error?.status >= 500) return 'Игровой сервис временно недоступен. Повторяем попытку…';
  return fallback;
}
