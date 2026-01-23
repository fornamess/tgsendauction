import { useEffect, useState } from 'react';
import api from '../utils/api';
import './AuctionDisplay.css';
import BetForm from './BetForm';
import TopBetsList from './TopBetsList';

interface Round {
  _id: string;
  number: number;
  status: string;
  startTime: string;
  endTime: string;
}

interface Bet {
  _id: string;
  amount: number;
  userId: {
    _id: string;
    username: string;
  };
}

interface CurrentRoundData {
  round: Round;
  top100: Array<{ rank: number; bet: Bet }>;
  userBet: Bet | null;
  userRank: number | null;
  winnersPerRound?: number;
}

interface AuctionDisplayProps {
  userId: string | null;
}

function AuctionDisplay({ userId }: AuctionDisplayProps) {
  const [data, setData] = useState<CurrentRoundData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [timeExtended, setTimeExtended] = useState(false);

  useEffect(() => {
    fetchCurrentRound();
    const interval = setInterval(fetchCurrentRound, 5000); // Обновление каждые 5 секунд
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!data?.round) return;

    const updateTimeLeft = () => {
      const now = new Date().getTime();
      const endTime = new Date(data.round.endTime).getTime();
      const diff = endTime - now;

      if (diff <= 0) {
        setTimeLeft('Раунд завершен');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [data?.round]);

  const fetchCurrentRound = async () => {
    try {
      const response = await api.get('/api/round/current');
      setData(response.data);
      setLoading(false);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка загрузки данных');
      setLoading(false);
    }
  };

  const handleBetPlaced = (extendedTime?: Date) => {
    if (extendedTime && data?.round) {
      // Обновить endTime в состоянии
      setData({
        ...data,
        round: {
          ...data.round,
          endTime: extendedTime.toISOString(),
        },
      });
      setTimeExtended(true);
      setTimeout(() => setTimeExtended(false), 5000); // Скрыть уведомление через 5 секунд
    }
    fetchCurrentRound();
  };

  if (loading) {
    return <div className="loading">Загрузка...</div>;
  }

  if (error) {
    return <div className="error">Ошибка: {error}</div>;
  }

  if (!data?.round) {
    return (
      <div className="no-round">Активный раунд не найден. Дождитесь начала нового раунда.</div>
    );
  }

  const { round, top100, userBet, userRank, winnersPerRound } = data;
  const topCount = winnersPerRound || 100;

  return (
    <div className="auction-display">
      {timeExtended && round.number === 1 && (
        <div className="anti-sniping-notification">
          ⏰ Время раунда продлено на 30 секунд (anti-sniping механизм)
        </div>
      )}
      <div className="round-header">
        <h1>Раунд #{round.number}</h1>
        <div className="round-info">
          <div className="time-left">
            <span className="label">До окончания раунда:</span>
            <span className="value">{timeLeft}</span>
          </div>
          <div className="status">
            Статус:{' '}
            <span className={round.status === 'active' ? 'active' : 'ended'}>
              {round.status === 'active' ? 'Активен' : 'Завершен'}
            </span>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="bet-section">
          <BetForm
            userId={userId}
            roundId={round._id}
            currentBet={userBet}
            onBetPlaced={handleBetPlaced}
          />
        </div>

        <div className="top-bets-section">
          <h2>ТОП-{topCount} ставок</h2>
          {userId && userBet && userRank && (
            <div className="user-rank">
              Ваша ставка: {userBet.amount} руб. - Место: #{userRank}
            </div>
          )}
          <TopBetsList top100={top100} userBet={userId ? userBet : null} />
        </div>
      </div>
    </div>
  );
}

export default AuctionDisplay;
