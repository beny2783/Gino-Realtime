import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/', async (request, reply) => {
  reply.send({ message: 'Hello World' });
});

const start = async () => {
  try {
    await app.listen({ port: 8080, host: '0.0.0.0' });
    console.log('Server started');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

start();
