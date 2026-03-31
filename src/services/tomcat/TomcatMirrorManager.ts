/**
 * Gerenciador de mirrors do Apache Tomcat
 * 
 * Features:
 * - Lista de mirrors oficiais do Apache
 * - Teste automático de latência
 * - Seleção do mirror mais rápido
 * - Fallback automático
 */
import { Logger } from "../../logging";
import type { TomcatMirror } from "./types";

// Mirrors oficiais do Apache Tomcat (priorizados por região)
const DEFAULT_MIRRORS: TomcatMirror[] = [
    // Américas
    { name: "Apache (USA)", url: "https://dlcdn.apache.org/tomcat", region: "US", priority: 1 },
    { name: "Apache Archive (USA)", url: "https://archive.apache.org/dist/tomcat", region: "US", priority: 2 },
    { name: "UFPR (Brazil)", url: "https://www.apache.dyn.ufpr.br/tomcat", region: "BR", priority: 1 },
    
    // Europa
    { name: "Apache (UK)", url: "https://downloads.apache.org/tomcat", region: "UK", priority: 1 },
    { name: "XMission (USA)", url: "https://apache.xmission.com/tomcat", region: "US", priority: 3 },
    
    // Ásia
    { name: "Tsinghua (China)", url: "https://mirrors.tuna.tsinghua.edu.cn/apache/tomcat", region: "CN", priority: 2 },
    { name: "NAVER (Korea)", url: "https://mirror.navercorp.com/apache/tomcat", region: "KR", priority: 2 },
    { name: "YAMAGATA (Japan)", url: "https://ftp.yz.yamagata-u.ac.jp/pub/network/apache/tomcat", region: "JP", priority: 2 },
    
    // Oceania
    { name: "AARNet (Australia)", url: "https://mirror.aarnet.edu.au/pub/apache/tomcat", region: "AU", priority: 3 },
];

// Tempo máximo de teste por mirror (ms)
const MIRROR_TEST_TIMEOUT = 5000;

export class TomcatMirrorManager {
    private logger = Logger.getInstance();
    private mirrors: TomcatMirror[];
    private latencyCache: Map<string, number> = new Map();

    constructor(customMirrors?: TomcatMirror[]) {
        this.mirrors = customMirrors || DEFAULT_MIRRORS;
    }

    /**
     * Retorna lista de mirrors disponíveis
     */
    getMirrors(): TomcatMirror[] {
        return [...this.mirrors];
    }

    /**
     * Testa latência de um mirror específico
     */
    async testMirror(mirror: TomcatMirror): Promise<number> {
        const cacheKey = mirror.url;
        
        // Verifica cache
        if (this.latencyCache.has(cacheKey)) {
            return this.latencyCache.get(cacheKey)!;
        }

        const startTime = Date.now();
        
        try {
            // Testa HEAD request em um arquivo pequeno (KEYS)
            const testUrl = `${mirror.url}/KEYS`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), MIRROR_TEST_TIMEOUT);
            
            const response = await fetch(testUrl, {
                method: "HEAD",
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const latency = Date.now() - startTime;
                this.latencyCache.set(cacheKey, latency);
                return latency;
            }
            
            return Infinity; // Mirror não respondeu corretamente
        } catch {
            return Infinity; // Mirror inacessível
        }
    }

    /**
     * Testa todos os mirrors e retorna ordenados por velocidade
     */
    async testAllMirrors(): Promise<Array<TomcatMirror & { latency: number }>> {
        this.logger.info("Testando mirrors disponíveis...");
        
        const results = await Promise.all(
            this.mirrors.map(async (mirror) => {
                const latency = await this.testMirror(mirror);
                return { ...mirror, latency };
            })
        );

        // Ordena por latência (menor primeiro), excluindo inacessíveis
        const sorted = results
            .filter(r => r.latency !== Infinity)
            .sort((a, b) => {
                // Prioridade + latência
                const scoreA = a.latency + (a.priority * 100);
                const scoreB = b.latency + (b.priority * 100);
                return scoreA - scoreB;
            });

        return sorted;
    }

    /**
     * Seleciona o melhor mirror automaticamente
     */
    async selectBestMirror(): Promise<TomcatMirror | null> {
        const tested = await this.testAllMirrors();
        
        if (tested.length === 0) {
            this.logger.warn("Nenhum mirror acessível encontrado");
            return null;
        }

        const best = tested[0];
        this.logger.success(`Mirror selecionado: ${best.name} (${best.latency}ms)`);
        
        // Mostra top 3 para debug
        if (tested.length > 1) {
            this.logger.debug("Top mirrors:");
            tested.slice(0, 3).forEach((m, i) => {
                this.logger.debug(`  ${i + 1}. ${m.name}: ${m.latency}ms`);
            });
        }

        return best;
    }

    /**
     * Constrói URL de download completo
     */
    buildDownloadUrl(mirror: TomcatMirror, version: string, filename: string): string {
        // Determina versão major (ex: 10.1.52 -> v10.1)
        const majorVersion = version.split(".").slice(0, 2).join(".");
        return `${mirror.url}/tomcat-${majorVersion}/v${version}/bin/${filename}`;
    }

    /**
     * Constrói URL do checksum
     */
    buildChecksumUrl(mirror: TomcatMirror, version: string, filename: string): string {
        const downloadUrl = this.buildDownloadUrl(mirror, version, filename);
        return `${downloadUrl}.sha512`;
    }

    /**
     * Adiciona mirror customizado
     */
    addMirror(mirror: TomcatMirror): void {
        this.mirrors.push(mirror);
        this.latencyCache.delete(mirror.url);
    }

    /**
     * Limpa cache de latência
     */
    clearCache(): void {
        this.latencyCache.clear();
    }

    /**
     * Retorna mirror por nome
     */
    getMirrorByName(name: string): TomcatMirror | undefined {
        return this.mirrors.find(m => 
            m.name.toLowerCase() === name.toLowerCase()
        );
    }
}
