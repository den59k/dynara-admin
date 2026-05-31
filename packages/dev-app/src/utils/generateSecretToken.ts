const SECRET_KEY = "my_secret_key";

// 1. Генерация токена
export function generateToken(data: any) {
    const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
    
    // Создаем HMAC подпись через Bun.CryptoHasher
    const hasher = new Bun.CryptoHasher("sha256", SECRET_KEY);
    hasher.update(payload);
    const signature = hasher.digest("base64url");

    return `${payload}.${signature}`;
}

// 2. Проверка токена
export function verifyToken(token: string) {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;

    // Генерируем проверочную подпись для сравнения
    const hasher = new Bun.CryptoHasher("sha256", SECRET_KEY);
    hasher.update(payload);
    const expectedSignature = hasher.digest("base64url");

    // Сравниваем подписи. Если не совпадают — токен изменен/подделан
    if (signature !== expectedSignature) return null;

    // Возвращаем исходный объект с данными
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
}
