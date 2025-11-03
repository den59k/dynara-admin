import { createHmac } from "node:crypto"

export class JwtError extends Error {

}

type JwtServerOptions = {
  secret: string,
  expirationTime?: number
}

export class JwtServer {

  expirationTime: number
  secret: string
  header = { alg: "HS256", type: "JWT" }
  headerBase64 = btoa(JSON.stringify(this.header))

  constructor(options: JwtServerOptions) {
    this.secret = options.secret
    this.expirationTime = options.expirationTime ?? 60 * 60 * 1000  // 1h
  }


  encode (payload: any) {
    const fullPayload = { exp: Math.trunc((Date.now() + this.expirationTime)/1000), ...payload }
    const str = `${this.headerBase64}.${btoa(JSON.stringify(fullPayload))}`
    const sign = createHmac('sha256', this.secret).update(str).digest('base64url');

    return `${str}.${sign}`
  }

  verifyAndDecode (jwt: string) {
    if (jwt.length > 300) throw new JwtError("JWT has wrong format")
    const parts = jwt.split(".", 4)
    if (parts.length !== 3) throw new JwtError("JWT has wrong format")

    if (parts[0] !== this.headerBase64) throw new JwtError("JWT has wrong header")
    const payload = JSON.parse(atob(parts[1]))

    if (!payload.exp || Date.now() > payload.exp*1000) throw new JwtError("JWT expired")
  
    const sign = createHmac('sha256', this.secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    if (sign !== parts[2]) throw new JwtError("JWT has wrong signature")

    return payload
  }
}