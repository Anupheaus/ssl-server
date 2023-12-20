import { createServer, Server } from 'https';
import { Duplex } from 'stream';
import { Logger } from '@anupheaus/common';
import { Cert, CertOptions } from 'selfsigned-ca';
import { IncomingMessage, RequestListener, ServerResponse } from 'http';

async function loadRootCertificate(rootCaCert: Cert, logger: Logger) {
  logger.info('Loading root certificate...');
  await rootCaCert.load();
  if (!await rootCaCert.isInstalled()) {
    logger.info('Installing root certificate...');
    await rootCaCert.install();
    logger.info('Root certificate installed.');
  } else {
    logger.info('Root certificate loaded.');
  }
}

async function createRootCertificate(rootCaCert: Cert, logger: Logger) {
  logger.info('Creating root certificate...');
  rootCaCert.createRootCa({
    subject: {
      commonName: 'Lintex Software',
      organizationName: 'Lintex Software',
      organizationalUnitName: 'Software Development',
      countryName: 'UK',
    },
  });
  logger.info('Root certificate created, saving...');
  await rootCaCert.save();
  logger.info('Root certificate saved, installing...');
  await rootCaCert.install();
  logger.info('Root certificate installed.');
}

async function createServerCertificate(serverCert: Cert, rootCaCert: Cert, logger: Logger, host: string) {
  const serverCertOptions: CertOptions = {
    subject: {
      commonName: host,
      organizationName: 'Lintex Software',
      organizationalUnitName: 'Software Development',
      countryName: 'UK',
    },
    extensions: [{
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: host }, // DNS
        { type: 7, ip: '127.0.0.1' }, // IP
      ],
    }],
  };
  logger.info('Creating server certificate...');
  serverCert.create(serverCertOptions, rootCaCert);
  logger.info('Server certificate created, saving...');
  await serverCert.save();
  logger.info('Server certificate saved.');
}

function createCertificate(serverCert: Cert, rootCaCert: Cert, logger: Logger, host: string) {
  return async () => {
    try {
      await loadRootCertificate(rootCaCert, logger);
    } catch (err) {
      logger.error('Failed to load root certificate, creating a new certificate...');
      await createRootCertificate(rootCaCert, logger);
    }
    await createServerCertificate(serverCert, rootCaCert, logger, host);
  };
}

interface Props {
  host: string;
  port: number;
  certsPath: string;
  logger?: Logger;
  callback?: RequestListener<typeof IncomingMessage, typeof ServerResponse>;
}

export interface CreateSSLServerResult {
  server: Server;
  startServer(): Promise<void>;
  stopServer(): Promise<void>;
  getConnectionCount(): number;
}

export async function createSSLServer({ host, port, certsPath, logger: providedLogger, callback }: Props): Promise<CreateSSLServerResult> {
  const logger = providedLogger ?? new Logger('SSL-Server');
  // fix up path
  certsPath = certsPath.replace(/\\$/, '/');
  if (certsPath.endsWith('/')) certsPath = certsPath.slice(0, -1);
  logger.debug('SSL certificates path', { certsPath });
  // create cert managers
  const rootCaCert = new Cert(`${certsPath}/root-ca`);
  const serverCert = new Cert(`${certsPath}/server`);

  await serverCert.load()
    .catch(createCertificate(serverCert, rootCaCert, logger, host));

  const server = createServer({
    key: serverCert.key,
    cert: serverCert.cert,
    ca: serverCert.caCert,
    rejectUnauthorized: false,
    requestCert: false,
  }, callback);

  const allConnections = new Set<Duplex>();
  server.on('connection', connection => {
    allConnections.add(connection);
    connection.on('close', () => allConnections.delete(connection));
  });

  const startServer = () => new Promise<void>(resolve => {
    logger.info(`Listening on port ${port}...`);
    server.listen(port, resolve);
  });

  const stopServer = () => new Promise<void>((resolve, reject) => {
    allConnections.forEach(connection => connection.destroy());
    server.close(error => {
      if (error) return reject(error);
      resolve();
    });
  });

  return {
    server,
    startServer,
    stopServer,
    getConnectionCount: () => allConnections.size,
  };
}
