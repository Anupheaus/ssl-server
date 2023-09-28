declare module 'selfsigned-ca' {

  export interface CertOptions {
    subject: {
      commonName: string;
      organizationName?: string;
      organizationalUnitName?: string;
      countryName?: string;
    };
    extensions?: {
      name: string;
      altNames?: {
        type: number;
        value?: string;
        ip?: string;
      }[];
    }[];
  }

  export class Cert {
    constructor(name: string);

    public get key(): string;

    public get cert(): string;

    public get caCert(): string;

    public load(): Promise<void>;

    public save(): Promise<void>;

    public isInstalled(): Promise<boolean>;

    public install(): Promise<void>;

    public createRootCa(options: CertOptions): void;

    public create(options: CertOptions, rootCaCert: Cert): void;
  }
}