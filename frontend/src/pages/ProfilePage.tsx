import { useEffect, useState } from 'react';
import api from '../utils/api';
import './ProfilePage.css';

interface User {
  _id: string;
  username: string;
  balance: number;
  robux: number;
}

interface Transaction {
  _id: string;
  type: string;
  amount: number;
  description?: string;
  createdAt: string;
}

interface Bet {
  _id: string;
  amount: number;
  roundId: {
    _id: string;
    number: number;
  };
  createdAt: string;
}

interface ProfileData {
  user: User;
  transactions: Transaction[];
  bets: Bet[];
}

interface ProfilePageProps {
  userId: string | null;
}

function ProfilePage({ userId }: ProfilePageProps) {
  if (!userId) {
    return (
      <div className="no-access">
        <h2>Требуется авторизация</h2>
        <p>Для просмотра профиля необходимо войти через Telegram</p>
      </div>
    );
  }
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState<number>(10000);
  const [depositing, setDepositing] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await api.get('/api/user/me');
      setData(response.data);
    } catch (err) {
      console.error('Ошибка загрузки профиля:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDepositing(true);
    try {
      await api.post('/api/user/deposit', { amount: depositAmount });
      await fetchProfile();
      alert('Баланс успешно пополнен!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка пополнения баланса');
    } finally {
      setDepositing(false);
    }
  };

  if (loading) {
    return <div className="loading">Загрузка профиля...</div>;
  }

  if (!data) {
    return <div className="error">Ошибка загрузки профиля</div>;
  }

  const { user, transactions, bets } = data;

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1>Профиль</h1>
        <div className="user-balance">
          <div className="balance-item">
            <span className="label">Баланс (руб.):</span>
            <span className="value">{user.balance.toLocaleString('ru-RU')}</span>
          </div>
          <div className="balance-item">
            <span className="label">Робуксы:</span>
            <span className="value robux">{user.robux.toLocaleString('ru-RU')}</span>
          </div>
        </div>
      </div>

      <div className="deposit-section">
        <h2>Пополнить баланс</h2>
        <form onSubmit={handleDeposit}>
          <input
            type="number"
            value={depositAmount}
            onChange={(e) => setDepositAmount(Number(e.target.value))}
            min="1"
            step="1"
            disabled={depositing}
          />
          <button type="submit" disabled={depositing}>
            {depositing ? 'Пополнение...' : 'Пополнить'}
          </button>
        </form>
      </div>

      <div className="bets-section">
        <h2>История ставок</h2>
        {bets.length === 0 ? (
          <div className="empty">Нет ставок</div>
        ) : (
          <div className="bets-list">
            {bets.map((bet) => (
              <div key={bet._id} className="bet-item">
                <div className="bet-info">
                  <span className="bet-round">Раунд #{bet.roundId.number}</span>
                  <span className="bet-amount">★{bet.amount.toLocaleString('ru-RU')}</span>
                </div>
                <div className="bet-date">
                  {new Date(bet.createdAt).toLocaleString('ru-RU')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="transactions-section">
        <h2>История транзакций</h2>
        {transactions.length === 0 ? (
          <div className="empty">Нет транзакций</div>
        ) : (
          <div className="transactions-list">
            {transactions.map((tx) => (
              <div key={tx._id} className={`transaction-item ${tx.type}`}>
                <div className="transaction-info">
                  <span className="transaction-type">{getTransactionTypeLabel(tx.type)}</span>
                  <span className={`transaction-amount ${tx.type}`}>
                    {tx.type === 'bet' || tx.type === 'deposit' ? '+' : ''}
                    {tx.amount.toLocaleString('ru-RU')}
                  </span>
                </div>
                {tx.description && (
                  <div className="transaction-description">{tx.description}</div>
                )}
                <div className="transaction-date">
                  {new Date(tx.createdAt).toLocaleString('ru-RU')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getTransactionTypeLabel(type: string): string {
  switch (type) {
    case 'bet':
      return 'Ставка';
    case 'refund':
      return 'Возврат';
    case 'prize':
      return 'Приз (робуксы)';
    case 'deposit':
      return 'Пополнение';
    default:
      return type;
  }
}

export default ProfilePage;
