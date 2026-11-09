import { Card } from '@ghosty/ui';
import { Link } from 'react-router';
import type { AggregatedData } from './api';
import { OfficialChannels } from './components';
import styles from './safety.module.css';

export type DisabledFeature = AggregatedData['disabledFeatures'][number];

/** Recurso desligado, sempre com o motivo. */
export function DisabledFeatureList({ features }: { features: DisabledFeature[] }) {
  return (
    <ul className={styles.items}>
      {features.map((feature) => (
        <li key={feature.id}>
          <strong>{feature.title}</strong>
          <span className={styles.hint}> {feature.reason}</span>
        </li>
      ))}
    </ul>
  );
}

/** O que o Ghosty não faz. */
export function LimitsCard() {
  return (
    <Card>
      <h2 className={styles.title}>O que o Ghosty não faz</h2>
      <ul className={styles.items}>
        <li>Não promete invisibilidade: é um site e pode aparecer no histórico do navegador.</li>
        <li>Não grava áudio, vídeo nem a tela.</li>
        <li>Usa a localização só com a sua permissão, e só no momento do pedido ou do check-in.</li>
        <li>Não chama a polícia nem substitui os serviços de emergência.</li>
        <li>Os avisos pelo Telegram passam pelos servidores do Telegram.</li>
      </ul>
    </Card>
  );
}

export function ChannelsScreen() {
  return (
    <div className={styles.stack}>
      <h1 className={styles.heading}>Canais oficiais</h1>
      <p>
        Em perigo imediato, ligue para um destes números. O Ghosty só mostra os números: ele não liga nem
        avisa nenhum desses serviços.
      </p>
      <OfficialChannels />
      <LimitsCard />
    </div>
  );
}

export function SettingsScreen({ features }: { features: DisabledFeature[] }) {
  return (
    <div className={styles.stack}>
      <h1 className={styles.heading}>Ajustes de segurança</h1>
      <Card>
        <h2 className={styles.title}>Código e mensagem</h2>
        <p>
          O código que abre esta área é o "código de bloqueio do app", em Configurações das notas (troque-o
          lá, com a sua senha). A mensagem, a localização e a contagem ficam em{' '}
          <Link to="/mensagem">Mensagem</Link>.
        </p>
      </Card>
      <Card>
        <h2 className={styles.title}>Ainda não disponível</h2>
        <DisabledFeatureList features={features} />
      </Card>
      <LimitsCard />
    </div>
  );
}
