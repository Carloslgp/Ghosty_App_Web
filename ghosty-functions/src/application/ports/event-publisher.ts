/** Publica um envelope de evento numa fila (Base64, como o resto do sistema). */
export interface EventPublisher {
  publish(queueName: string, envelope: object): Promise<void>;
}
