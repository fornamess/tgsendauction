import { useEffect, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import AuthButton from './AuthButton';
import './BetForm.css';

interface Bet {
  _id: string;
  amount: number;
}

interface BetFormProps {
  userId: string | null;
  roundId: string;
  currentBet: Bet | null;
  onBetPlaced: (extendedTime?: Date) => void;
}

function BetForm({ userId, roundId, currentBet, onBetPlaced }: BetFormProps) {
  const { isAuthenticated } = useAuth();
  const [amount, setAmount] = useState<number>(currentBet?.amount || 1000);
  const [minAmount, setMinAmount] = useState<number>(1000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (currentBet) {
      setMinAmount(currentBet.amount + 1);
      setAmount(currentBet.amount + 1);
    }
  }, [currentBet]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(Number(e.target.value));
    setError(null);
    setSuccess(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    if (value >= minAmount) {
      setAmount(value);
      setError(null);
      setSuccess(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await api.post('/api/bet', {
        roundId,
        amount,
      });
      setSuccess(true);
      // Передать информацию о продлении времени, если есть
      const extendedTime = response.data.round?.endTime
        ? new Date(response.data.round.endTime)
        : undefined;
      onBetPlaced(extendedTime);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка размещения ставки');
    } finally {
      setLoading(false);
    }
  };

  const increaseAmount = (value: number) => {
    setAmount((prev) => {
      const newAmount = prev + value;
      return newAmount >= minAmount ? newAmount : minAmount;
    });
  };

  if (!isAuthenticated || !userId) {
    return (
      <div className="bet-form">
        <h3>Разместить ставку</h3>
        <div className="auth-required-message">
          <p>Для участия в аукционе необходимо авторизоваться через Telegram</p>
          <AuthButton />
        </div>
      </div>
    );
  }

  return (
    <div className="bet-form">
      <h3>{currentBet ? 'Повысить ставку' : 'Разместить ставку'}</h3>

      {currentBet && (
        <div className="current-bet">
          Текущая ставка: <strong>{currentBet.amount} руб.</strong>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="bet-input-group">
          <label>
            Сумма ставки (руб.)
            <input
              type="number"
              value={amount}
              onChange={handleInputChange}
              min={minAmount}
              step="1"
              className="bet-input"
              disabled={loading}
            />
          </label>
        </div>

        <div className="slider-group">
          <input
            type="range"
            min={minAmount}
            max={Math.max(minAmount * 10, 100000)}
            value={amount}
            onChange={handleSliderChange}
            className="bet-slider"
            disabled={loading}
          />
          <div className="slider-labels">
            <span>{minAmount}</span>
            <span>{Math.max(minAmount * 10, 100000)}</span>
          </div>
        </div>

        <div className="quick-buttons">
          <button type="button" onClick={() => increaseAmount(1000)} disabled={loading}>
            +1 000
          </button>
          <button type="button" onClick={() => increaseAmount(5000)} disabled={loading}>
            +5 000
          </button>
          <button type="button" onClick={() => increaseAmount(10000)} disabled={loading}>
            +10 000
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">Ставка успешно размещена!</div>}

        <button type="submit" className="submit-button" disabled={loading || amount < minAmount}>
          {loading
            ? 'Обработка...'
            : currentBet
            ? `Повысить ставку на ${amount - currentBet.amount} руб.`
            : `Поставить ${amount} руб.`}
        </button>
      </form>
    </div>
  );
}

export default BetForm;
