import { useEffect, useState } from 'react';
import api from '../utils/api';
import './AdminPage.css';

interface Auction {
  _id: string;
  name: string;
  prizeRobux: number;
  status: string;
}

interface AdminPageProps {
  userId: string;
}

function AdminPage({ userId }: AdminPageProps) {
  const [auction, setAuction] = useState<Auction | null>(null);
  const [loading, setLoading] = useState(false);
  const [newAuctionName, setNewAuctionName] = useState('');
  const [newAuctionPrize, setNewAuctionPrize] = useState(1000);

  useEffect(() => {
    fetchAuction();
  }, []);

  const fetchAuction = async () => {
    try {
      // Пробуем сначала получить активный аукцион
      try {
        const currentResponse = await api.get('/api/auction/current');
        setAuction(currentResponse.data);
        return;
      } catch (err) {
        // Если нет активного, получаем все аукционы и берем последний
        const allResponse = await api.get('/api/auction/all');
        const auctions = allResponse.data;
        if (auctions && auctions.length > 0) {
          // Берем последний созданный аукцион (черновик или активный)
          setAuction(auctions[0]);
          return;
        }
      }
      setAuction(null);
    } catch (err) {
      console.error('Ошибка получения аукциона:', err);
      setAuction(null);
    }
  };

  const handleCreateAuction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      console.log('Отправка запроса на создание аукциона:', {
        name: newAuctionName,
        prizeRobux: newAuctionPrize,
      });
      const response = await api.post('/api/auction', {
        name: newAuctionName,
        prizeRobux: newAuctionPrize,
      });
      console.log('Аукцион создан:', response.data);
      setAuction(response.data);
      setNewAuctionName('');
      setNewAuctionPrize(1000);
      alert('✅ Аукцион успешно создан! Теперь нажмите "Запустить аукцион" чтобы начать.');
    } catch (err: any) {
      console.error('Ошибка создания аукциона:', err);
      alert(`❌ Ошибка создания аукциона: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStartAuction = async () => {
    if (!auction) return;
    setLoading(true);
    try {
      await api.post(`/api/auction/${auction._id}/start`);
      await fetchAuction();
      alert(
        '✅ Аукцион успешно запущен! Первый раунд создан автоматически. Теперь можно участвовать в аукционе на главной странице.'
      );
    } catch (err: any) {
      alert(`❌ Ошибка запуска аукциона: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEndAuction = async () => {
    if (!auction) return;
    if (
      !confirm('Вы уверены, что хотите завершить аукцион? Это вернет средства всем проигравшим.')
    ) {
      return;
    }
    setLoading(true);
    try {
      await api.post(`/api/auction/${auction._id}/end`);
      await fetchAuction();
      alert('Аукцион завершен! Средства возвращены проигравшим.');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка завершения аукциона');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-page">
      <h1>Админ-панель</h1>

      {auction ? (
        <div className="auction-management">
          <h2>Текущий аукцион</h2>
          <div className="auction-info">
            <div>
              <strong>Название:</strong> {auction.name}
            </div>
            <div>
              <strong>Приз:</strong> {auction.prizeRobux} робуксов
            </div>
            <div>
              <strong>Статус:</strong>{' '}
              <span className={`status-badge ${auction.status}`}>
                {auction.status === 'draft'
                  ? 'Черновик'
                  : auction.status === 'active'
                  ? 'Активен'
                  : 'Завершен'}
              </span>
            </div>
            {auction.status === 'draft' && (
              <div className="status-hint">
                ⚠️ Аукцион создан, но не запущен. Нажмите "Запустить аукцион" чтобы начать.
              </div>
            )}
            {auction.status === 'active' && (
              <div className="status-hint success">
                ✅ Аукцион активен! Участники могут делать ставки на главной странице.
              </div>
            )}
          </div>
          <div className="auction-actions">
            {auction.status === 'draft' && (
              <button onClick={handleStartAuction} disabled={loading}>
                Запустить аукцион
              </button>
            )}
            {auction.status === 'active' && (
              <button onClick={handleEndAuction} disabled={loading}>
                Завершить аукцион
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="create-auction">
          <h2>Создать новый аукцион</h2>
          <form onSubmit={handleCreateAuction}>
            <div className="form-group">
              <label>
                Название аукциона:
                <input
                  type="text"
                  value={newAuctionName}
                  onChange={(e) => setNewAuctionName(e.target.value)}
                  required
                  disabled={loading}
                />
              </label>
            </div>
            <div className="form-group">
              <label>
                Приз (робуксов):
                <input
                  type="number"
                  value={newAuctionPrize}
                  onChange={(e) => setNewAuctionPrize(Number(e.target.value))}
                  min="1"
                  required
                  disabled={loading}
                />
              </label>
            </div>
            <button type="submit" disabled={loading}>
              {loading ? 'Создание...' : 'Создать аукцион'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default AdminPage;
