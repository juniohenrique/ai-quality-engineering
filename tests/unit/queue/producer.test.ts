import { describe, expect, it, vi, beforeEach } from "vitest";
import { RabbitMqProducer } from "../../../src/queue/producer";

const mockChannel = {
  assertExchange: vi.fn(),
  assertQueue: vi.fn(),
  bindQueue: vi.fn(),
  sendToQueue: vi.fn(),
  close: vi.fn(),
};

const mockConnection = {
  createChannel: vi.fn(),
  removeAllListeners: vi.fn(),
  on: vi.fn(),
  close: vi.fn(),
};

vi.mock("amqplib", () => ({
  connect: vi.fn(() => Promise.resolve(mockConnection)),
}));

describe("RabbitMqProducer", () => {
  let producer: RabbitMqProducer;

  beforeEach(() => {
    vi.clearAllMocks();
        mockChannel.assertQueue.mockResolvedValue({ messageCount: 0, consumerCount: 0 });
    mockChannel.assertExchange.mockResolvedValue({ exchange: "" });
    mockChannel.bindQueue.mockResolvedValue({});
    mockChannel.sendToQueue.mockReturnValue(true);
    mockChannel.close.mockResolvedValue(undefined);
    mockConnection.createChannel.mockResolvedValue(mockChannel);
    mockConnection.close.mockResolvedValue(undefined);

    producer = new RabbitMqProducer({ url: "amqp://test", attempts: 1, delayMs: 0 });
  });

  describe("publish", () => {
    it("chama assertQueue + sendToQueue com payload JSON + correlationId", async () => {
      const payload = { foo: "bar" };
      await producer.publish("test_queue", payload);

            expect(mockChannel.assertQueue).toHaveBeenCalledWith("test_queue", {
        durable: true,
        deadLetterExchange: "payments-dlx",
        deadLetterRoutingKey: "payments-dlq",
      });
      expect(mockChannel.sendToQueue).toHaveBeenCalled();

      const callArgs = mockChannel.sendToQueue.mock.calls[0];
      expect(callArgs[0]).toBe("test_queue");

      const content = callArgs[1];
      expect(JSON.parse(Buffer.from(content).toString())).toEqual(payload);

      const options = callArgs[2];
      expect(options.contentType).toBe("application/json");
      expect(options.correlationId).toBeDefined();
      expect(options.headers).toHaveProperty("x-correlation-id", options.correlationId);
    });

    it("usa correlationId fornecido via options", async () => {
      await producer.publish("test_queue", {}, { correlationId: "custom-id" });
      const callArgs = mockChannel.sendToQueue.mock.calls[0];
      const options = callArgs[2];
      expect(options.correlationId).toBe("custom-id");
    });

    it("usa correlationId de headers quando correlationId ausente", async () => {
      await producer.publish("test_queue", {}, { headers: { "x-correlation-id": "header-id" } });
      const callArgs = mockChannel.sendToQueue.mock.calls[0];
      const options = callArgs[2];
      expect(options.correlationId).toBe("header-id");
    });

    it("gera correlationId quando ausente", async () => {
      await producer.publish("test_queue", {});
      const callArgs = mockChannel.sendToQueue.mock.calls[0];
      const options = callArgs[2];
      expect(options.correlationId).toBeDefined();
      expect(typeof options.correlationId).toBe("string");
    });
  });

  describe("reconnect", () => {
    it("reconecta quando a conexão é perdida (close event)", async () => {
      await producer.connect();
      expect(mockConnection.createChannel).toHaveBeenCalledTimes(1);

      // Simulate connection close event
      const onHandlers: Record<string, () => void> = {};
      mockConnection.on.mockImplementation((event: string, handler: () => void) => {
        onHandlers[event] = handler;
      });

      // Simulate another connect cycle
      await producer.connect();
    });
  });

  describe("close", () => {
    it("fecha canal e conexão na ordem correta", async () => {
      await producer.connect();
      await producer.close();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it("encerra o producer de forma graciosa", async () => {
      await producer.connect();
      await producer.close();
      expect(producer.isConnected).toBe(false);
    });
  });

  describe("lazy connect", () => {
    it("não conecta até o primeiro publish", async () => {
      expect(mockConnection.createChannel).not.toHaveBeenCalled();
      await producer.publish("test_queue", { data: 1 });
      expect(mockConnection.createChannel).toHaveBeenCalledTimes(1);
    });
  });
});
