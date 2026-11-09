import { Banner, Button, Card, Spinner } from '@ghosty/ui';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAggregatedData, useAlertSettings, useSaveAlertSettings, type GeoPermission } from './api';
import { ContactList, MessageEditor, ReadinessCard } from './components';
import styles from './safety.module.css';

/** Estado da permissão de localização, sem pedir nada (o pedido é feito no onboarding, em privado). */
export function useGeoPermission(): GeoPermission {
  const [state, setState] = useState<GeoPermission>('unknown');
  useEffect(() => {
    let active = true;
    void navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((status) => active && setState(status.state))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return state;
}

export function OnboardingScreen() {
  const navigate = useNavigate();
  const [location, setLocation] = useState<'idle' | 'granted' | 'denied'>('idle');

  const askLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      () => setLocation('granted'),
      () => setLocation('denied'),
      { timeout: 8000, maximumAge: 60000 },
    );
  };

  return (
    <div className={styles.stack}>
      <h1 className={styles.heading}>Antes de começar</h1>
      <Card>
        <h2 className={styles.title}>O que esta área faz</h2>
        <p>
          Ela avisa a sua rede de apoio, pelo Telegram ou por uma página web, quando você pede ajuda ou não
          confirma que chegou bem.
        </p>
        <p>
          Ela <strong>não</strong> chama a polícia nem outros serviços de emergência. Em perigo imediato,
          ligue 190.
        </p>
        <p>
          Este é um site: ele pode aparecer no histórico e nos favoritos do navegador. A proteção é a
          discrição, não a invisibilidade.
        </p>
      </Card>
      <Card>
        <h2 className={styles.title}>Localização</h2>
        <p>
          Peça a permissão agora, com calma. A localização só é usada na hora de um pedido ou de um check-in.
        </p>
        <Button variant="secondary" onClick={askLocation}>
          Permitir localização
        </Button>
        {location === 'granted' && <Banner tone="success">Localização permitida.</Banner>}
        {location === 'denied' && (
          <Banner tone="warning">Sem localização, os avisos seguem sem o mapa.</Banner>
        )}
      </Card>
      <ol className={styles.steps}>
        <li>
          <Link to="/rede">Adicione pelo menos 1 contato e gere o convite</Link>
        </li>
        <li>
          <Link to="/mensagem">Revise a mensagem e veja a prévia</Link>
        </li>
      </ol>
      <Button onClick={() => navigate('/painel')}>Ir para o painel</Button>
    </div>
  );
}

export function DashboardScreen() {
  const geo = useGeoPermission();
  const data = useAggregatedData(geo);
  if (data.isPending) return <Spinner />;
  if (data.isError) return <Banner tone="alert">Não foi possível carregar o painel agora.</Banner>;
  const { safety, disabledFeatures } = data.data;

  return (
    <div className={styles.stack}>
      <h1 className={styles.heading}>Painel</h1>
      {safety === null && <Banner tone="warning">Parte das informações está indisponível agora.</Banner>}
      {safety?.network.total === 0 && (
        <Banner>
          Sua rede ainda está vazia. <Link to="/onboarding">Comece por aqui</Link>.
        </Banner>
      )}
      <ReadinessCard data={data.data} />
      {safety?.activeCheckIn && (
        <Card>
          <h2 className={styles.title}>Check-in ativo</h2>
          <p>
            {safety.activeCheckIn.destination}, até{' '}
            {new Date(safety.activeCheckIn.deadlineAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </Card>
      )}
      {disabledFeatures.length > 0 && (
        <Card>
          <h2 className={styles.title}>Ainda não disponível</h2>
          <ul className={styles.items}>
            {disabledFeatures.map((feature) => (
              <li key={feature.id}>{feature.reason}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export function NetworkScreen() {
  return (
    <div className={styles.stack}>
      <h1 className={styles.heading}>Rede de apoio</h1>
      <p className={styles.hint}>
        Os contatos são avisados nesta ordem. Só quem confirmou o convite recebe avisos.
      </p>
      <ContactList />
    </div>
  );
}

export function MessageScreen() {
  const settings = useAlertSettings();
  const save = useSaveAlertSettings();
  const [saved, setSaved] = useState(false);
  if (settings.isPending) return <Spinner />;
  if (settings.isError) return <Banner tone="alert">Não foi possível carregar a mensagem.</Banner>;
  return (
    <div className={styles.stack}>
      <h1 className={styles.heading}>Mensagem</h1>
      {saved && <Banner tone="success">Mensagem salva e marcada como revisada.</Banner>}
      {save.isError && <Banner tone="alert">Não foi possível salvar a mensagem.</Banner>}
      <MessageEditor
        settings={settings.data}
        saving={save.isPending}
        onSave={(values) => {
          setSaved(false);
          save.mutate(values, { onSuccess: () => setSaved(true) });
        }}
      />
    </div>
  );
}
