/**
 * OperationLogger - Logger especializado para operações complexas com múltiplas etapas
 * 
 * Uso:
 * const op = new OperationLogger('deploy');
 * op.start('Iniciando deploy');
 * 
 * const buildStep = op.step('build', 'Compilando projeto...');
 * await buildService.build();
 * buildStep.success('Build concluído em 3.2s');
 * 
 * op.complete('Deploy finalizado com sucesso');
 */

import type { OperationStep } from './types';
import { Logger } from './Logger';
import { Colors, Icons } from './colors';
import { LAYOUT } from './constants';

export class OperationStepLogger {
  private operation: OperationLogger;
  private step: OperationStep;

  constructor(operation: OperationLogger, step: OperationStep) {
    this.operation = operation;
    this.step = step;
  }

  /**
   * Marca o passo como em execução
   */
  start(message?: string): void {
    this.step.status = 'running';
    this.step.startTime = new Date();
    if (message) {
      this.step.message = message;
    }
    this.operation.logStep(this.step);
  }

  /**
   * Atualiza mensagem do passo
   */
  update(message: string): void {
    this.step.message = message;
    this.operation.logStep(this.step);
  }

  /**
   * Marca o passo como concluído com sucesso
   */
  success(message?: string): void {
    this.step.status = 'success';
    this.step.endTime = new Date();
    if (message) {
      this.step.message = message;
    }
    this.operation.logStep(this.step);
  }

  /**
   * Marca o passo como falho
   */
  fail(error: Error | string): void {
    this.step.status = 'failed';
    this.step.endTime = new Date();
    this.step.error = error instanceof Error ? error : new Error(error);
    this.step.message = error instanceof Error ? error.message : error;
    this.operation.logStep(this.step);
  }

  /**
   * Obtém dados do passo
   */
  getData(): OperationStep {
    return { ...this.step };
  }
}

export class OperationLogger {
  private name: string;
  private steps: OperationStep[] = [];
  private startTime: Date | null = null;
  private endTime: Date | null = null;
  private status: 'pending' | 'running' | 'success' | 'failed' = 'pending';
  private traceId: string;
  private logger: Logger;

  constructor(name: string, logger?: Logger) {
    this.name = name;
    this.logger = logger || Logger.getInstance();
    this.traceId = this.logger.generateTraceId() || '';
  }

  /**
   * Inicia a operação
   */
  start(message?: string): void {
    this.startTime = new Date();
    this.status = 'running';
    
    const icon = Icons.arrow;
    const color = Colors.primary;
    const bold = Colors.bold;
    const reset = Colors.reset;
    
    // Usa log direto sem ícone duplicado
    this.logger.log('info', `${color}${icon}${reset} ${bold}${this.name}${reset}${message ? ': ' + message : ''}`);
  }

  /**
   * Cria um novo passo na operação
   */
  step(id: string, message?: string): OperationStepLogger {
    const stepData: OperationStep = {
      id,
      name: id,
      status: 'pending',
      message,
    };
    
    this.steps.push(stepData);
    const stepLogger = new OperationStepLogger(this, stepData);
    stepLogger.start(message);
    return stepLogger;
  }

  /**
   * Loga um passo
   */
  logStep(step: OperationStep): void {
    const indent = ' '.repeat(LAYOUT.indentSize * 2);
    
    let icon: string;
    let color: string;
    
    switch (step.status) {
      case 'running':
        icon = Icons.spinner;
        color = Colors.primary;
        break;
      case 'success':
        icon = Icons.success;
        color = Colors.success;
        break;
      case 'failed':
        icon = Icons.error;
        color = Colors.error;
        break;
      default:
        icon = Icons.pending;
        color = Colors.gray;
    }
    
    const reset = Colors.reset;
    const dim = Colors.dim;
    
    let message = step.message || step.name;
    
    // Adiciona tempo se concluído
    if ((step.status === 'success' || step.status === 'failed') && step.startTime && step.endTime) {
      const duration = ((step.endTime.getTime() - step.startTime.getTime()) / 1000).toFixed(1);
      message += ` ${dim}(${duration}s)${reset}`;
    }
    
    // Usa log direto sem ícone duplicado do logger.info()
    this.logger.log('info', `${indent}${color}${icon}${reset} ${message}`);
  }

  /**
   * Completa a operação com sucesso
   */
  complete(message?: string): void {
    this.endTime = new Date();
    this.status = 'success';
    
    const icon = Icons.success;
    const color = Colors.success;
    const bold = Colors.bold;
    const reset = Colors.reset;
    const dim = Colors.dim;
    
    let finalMessage = message || `${this.name} concluído`;
    
    // Adiciona tempo total
    if (this.startTime) {
      const duration = ((this.endTime.getTime() - this.startTime.getTime()) / 1000).toFixed(1);
      finalMessage += ` ${dim}(${duration}s)${reset}`;
    }
    
    // Usa log direto sem ícone duplicado
    this.logger.log('info', `${color}${icon}${reset} ${bold}${finalMessage}${reset}`);
  }

  /**
   * Falha na operação
   */
  fail(message?: string, error?: Error): void {
    this.endTime = new Date();
    this.status = 'failed';
    
    const icon = Icons.error;
    const color = Colors.error;
    const bold = Colors.bold;
    const reset = Colors.reset;
    const dim = Colors.dim;
    
    let finalMessage = message || `${this.name} falhou`;
    
    // Adiciona tempo total
    if (this.startTime) {
      const duration = ((this.endTime.getTime() - this.startTime.getTime()) / 1000).toFixed(1);
      finalMessage += ` ${dim}(${duration}s)${reset}`;
    }
    
    // Usa log direto para erro
    this.logger.log('error', `${color}${icon}${reset} ${bold}${finalMessage}${reset}`);
    
    // Loga detalhes do erro
    if (error) {
      this.logger.group('Detalhes do erro');
      this.logger.error(error.message);
      if (error.stack) {
        const lines = error.stack.split('\n').slice(1, 5);
        for (const line of lines) {
          this.logger.debug(line.trim());
        }
      }
      this.logger.groupEnd();
    }
    
    // Loga passos que falharam
    const failedSteps = this.steps.filter(s => s.status === 'failed');
    if (failedSteps.length > 0) {
      this.logger.group('Passos com falha');
      for (const step of failedSteps) {
        this.logger.error(`${step.name}: ${step.error?.message || 'Falha desconhecida'}`);
      }
      this.logger.groupEnd();
    }
  }

  /**
   * Obtém estatísticas da operação
   */
  getStats(): {
    name: string;
    status: string;
    duration: number;
    steps: { total: number; success: number; failed: number; pending: number };
  } {
    const duration = this.startTime && this.endTime
      ? (this.endTime.getTime() - this.startTime.getTime()) / 1000
      : 0;
    
    return {
      name: this.name,
      status: this.status,
      duration,
      steps: {
        total: this.steps.length,
        success: this.steps.filter(s => s.status === 'success').length,
        failed: this.steps.filter(s => s.status === 'failed').length,
        pending: this.steps.filter(s => s.status === 'pending').length,
      },
    };
  }

  /**
   * Verifica se a operação teve sucesso
   */
  isSuccess(): boolean {
    return this.status === 'success';
  }

  /**
   * Verifica se a operação falhou
   */
  isFailed(): boolean {
    return this.status === 'failed';
  }

  /**
   * Obtém trace ID da operação
   */
  getTraceId(): string {
    return this.traceId;
  }
}

/**
 * Cria uma nova operação (função helper)
 */
export function createOperation(name: string, logger?: Logger): OperationLogger {
  return new OperationLogger(name, logger);
}
