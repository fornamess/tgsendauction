import { useEffect, useState } from 'react';
import api from '../utils/api';
import './AdminPage.css';

interface Auction {
  _id: string;
  name: string;
  prizeRobux?: number;
  rewardAmount?: number;
  winnersPerRound?: number;
  totalRounds?: number;
  roundDurationMinutes?: number;
  status: string;
}

interface AdminPageProps {
  userId: string | null;
}

interface Round {
  _id: string;
  number: number;
  status: string;
  startTime: string;
  endTime: string;
}

function AdminPage({ userId }: AdminPageProps) {
  if (!userId) {
    return (
      <div className="no-access">
        <h2>Требуется авторизация</h2>
        <p>Для доступа к админ-панели необходимо войти через Telegram</p>
      </div>
    );
  }
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(false);
  const [newAuctionName, setNewAuctionName] = useState('');
  const [newAuctionReward, setNewAuctionReward] = useState(1000);
  const [newWinnersPerRound, setNewWinnersPerRound] = useState(100);
  const [newTotalRounds, setNewTotalRounds] = useState(30);
  const [newRoundDuration, setNewRoundDuration] = useState(60);
  const [editAuctionName, setEditAuctionName] = useState('');
  const [editAuctionReward, setEditAuctionReward] = useState(1000);
  const [editWinnersPerRound, setEditWinnersPerRound] = useState(100);
  const [editTotalRounds, setEditTotalRounds] = useState(30);
  const [editRoundDuration, setEditRoundDuration] = useState(60);

  useEffect(() => {
    fetchAuction();
  }, []);

  useEffect(() => {
    if (auction?.status === 'active') {
      fetchCurrentRound();
    } else {
      setCurrentRound(null);
    }
  }, [auction?.status, auction?._id]);

  const fetchAuction = async () => {
    try {
      // Пробуем сначала получить активный аукцион
      try {
        const currentResponse = await api.get('/api/auction/current');
        if (currentResponse.data) {
          setAuction(currentResponse.data);
          setEditAuctionName(currentResponse.data.name);
          setEditAuctionReward(currentResponse.data.rewardAmount ?? currentResponse.data.prizeRobux ?? 1000);
          setEditWinnersPerRound(currentResponse.data.winnersPerRound ?? 100);
          setEditTotalRounds(currentResponse.data.totalRounds ?? 30);
          setEditRoundDuration(currentResponse.data.roundDurationMinutes ?? 60);
          return;
        }
      } catch (err) {
        // Игнорируем ошибку, проверяем дальше
      }

      // Если нет активного, получаем все аукционы и ищем черновик или активный
      try {
        const allResponse = await api.get('/api/auction/all');
        const auctions = allResponse.data;
        if (auctions && auctions.length > 0) {
          // Ищем активный или черновик аукцион (не завершенный)
          const activeOrDraft = auctions.find(
            (a: Auction) => a.status === 'active' || a.status === 'draft'
          );
          if (activeOrDraft) {
            setAuction(activeOrDraft);
            setEditAuctionName(activeOrDraft.name);
            setEditAuctionReward(activeOrDraft.rewardAmount ?? activeOrDraft.prizeRobux ?? 1000);
            setEditWinnersPerRound(activeOrDraft.winnersPerRound ?? 100);
            setEditTotalRounds(activeOrDraft.totalRounds ?? 30);
            setEditRoundDuration(activeOrDraft.roundDurationMinutes ?? 60);
            return;
          }
        }
      } catch (err) {
        // Игнорируем ошибку
      }

      // Если нет активного или черновика, показываем форму создания
      setAuction(null);
    } catch (err) {
      // Ошибка уже залогирована в interceptor
      setAuction(null);
    }
  };

  const handleCreateAuction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await api.post('/api/auction', {
        name: newAuctionName,
        rewardAmount: newAuctionReward,
        winnersPerRound: newWinnersPerRound,
        totalRounds: newTotalRounds,
        roundDurationMinutes: newRoundDuration,
      });
      setAuction(response.data);
      setNewAuctionName('');
      setNewAuctionReward(1000);
      setNewWinnersPerRound(100);
      setNewTotalRounds(30);
      setNewRoundDuration(60);
      alert('✅ Аукцион успешно создан! Теперь нажмите "Запустить аукцион" чтобы начать.');
    } catch (err: any) {
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
      await fetchCurrentRound();
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
      setCurrentRound(null);
      alert('Аукцион завершен! Средства возвращены проигравшим.');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Ошибка завершения аукциона');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAuction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auction) return;
    setLoading(true);
    try {
      const response = await api.patch(`/api/auction/${auction._id}`, {
        name: editAuctionName,
        rewardAmount: editAuctionReward,
        winnersPerRound: editWinnersPerRound,
        totalRounds: editTotalRounds,
        roundDurationMinutes: editRoundDuration,
      });
      setAuction(response.data);
      alert('✅ Настройки аукциона обновлены');
    } catch (err: any) {
      alert(`❌ Ошибка обновления: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentRound = async () => {
    try {
      const response = await api.get('/api/round/current');
      if (response.data?.round) {
        setCurrentRound(response.data.round);
      } else {
        setCurrentRound(null);
      }
    } catch (err) {
      setCurrentRound(null);
    }
  };

  const handleEndCurrentRound = async () => {
    if (!currentRound) return;
    if (
      !confirm(
        `Вы уверены, что хотите завершить раунд ${currentRound.number} преждевременно? Это обработает победителей и создаст следующий раунд (если это не последний).`
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const response = await api.post('/api/round/current/end');
      alert(
        `✅ Раунд ${currentRound.number} завершен! Победителей: ${response.data.winnersCount || 0}. ${
          response.data.isLastRound
            ? 'Аукцион завершен.'
            : `Создан раунд ${currentRound.number + 1}.`
        }`
      );
      await fetchAuction();
      await fetchCurrentRound();
    } catch (err: any) {
      alert(`❌ Ошибка завершения раунда: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNextRound = async () => {
    if (!auction) return;
    setLoading(true);
    try {
      const response = await api.post('/api/round/next');
      alert(`✅ Раунд ${response.data.round.number} успешно создан!`);
      await fetchCurrentRound();
    } catch (err: any) {
      alert(`❌ Ошибка создания раунда: ${err.response?.data?.error || err.message}`);
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
              <strong>Приз:</strong> {auction.rewardAmount ?? auction.prizeRobux} робуксов
            </div>
            <div>
              <strong>Победителей в раунде:</strong> {auction.winnersPerRound ?? 100}
            </div>
            <div>
              <strong>Всего раундов:</strong> {auction.totalRounds ?? 30}
            </div>
            <div>
              <strong>Длительность раунда:</strong> {auction.roundDurationMinutes ?? 60} мин.
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
            {auction.status === 'ended' && (
              <div className="status-hint">
                ⚠️ Аукцион завершен. Вы можете создать новый аукцион ниже.
              </div>
            )}
          </div>

          {auction.status === 'active' && currentRound && (
            <div className="round-info" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#2a2a2a', borderRadius: '8px' }}>
              <h3>Текущий раунд #{currentRound.number}</h3>
              <div style={{ marginTop: '10px', fontSize: '14px', color: '#aaa' }}>
                <div>Начало: {new Date(currentRound.startTime).toLocaleString('ru-RU')}</div>
                <div>Окончание: {new Date(currentRound.endTime).toLocaleString('ru-RU')}</div>
                <div style={{ marginTop: '5px' }}>
                  Осталось: {Math.max(0, Math.floor((new Date(currentRound.endTime).getTime() - Date.now()) / 1000 / 60))} мин.
                </div>
              </div>
            </div>
          )}

          <div className="auction-actions">
            {auction.status === 'draft' && (
              <button onClick={handleStartAuction} disabled={loading}>
                Запустить аукцион
              </button>
            )}
            {auction.status === 'active' && (
              <>
                {currentRound ? (
                  <button
                    onClick={handleEndCurrentRound}
                    disabled={loading}
                    style={{ backgroundColor: '#ff6b6b', marginRight: '10px' }}
                  >
                    ⏱️ Завершить раунд {currentRound.number} (для демо)
                  </button>
                ) : (
                  <button
                    onClick={handleCreateNextRound}
                    disabled={loading}
                    style={{ backgroundColor: '#51cf66', marginRight: '10px' }}
                  >
                    ➕ Создать следующий раунд
                  </button>
                )}
                <button onClick={handleEndAuction} disabled={loading} style={{ backgroundColor: '#ff6b6b' }}>
                  ⛔ Завершить весь аукцион
                </button>
              </>
            )}
          </div>
          {auction.status === 'draft' && (
            <form className="auction-edit" onSubmit={handleUpdateAuction}>
              <h3>Настройки аукциона</h3>
              <div className="form-group">
                <label>
                  Название аукциона:
                  <input
                    type="text"
                    value={editAuctionName}
                    onChange={(e) => setEditAuctionName(e.target.value)}
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
                    value={editAuctionReward}
                    onChange={(e) => setEditAuctionReward(Number(e.target.value))}
                    min="1"
                    required
                    disabled={loading}
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  Победителей в раунде:
                  <input
                    type="number"
                    value={editWinnersPerRound}
                    onChange={(e) => setEditWinnersPerRound(Number(e.target.value))}
                    min="1"
                    required
                    disabled={loading}
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  Всего раундов:
                  <input
                    type="number"
                    value={editTotalRounds}
                    onChange={(e) => setEditTotalRounds(Number(e.target.value))}
                    min="1"
                    required
                    disabled={loading}
                  />
                </label>
              </div>
              <div className="form-group">
                <label>
                  Длительность раунда (мин.):
                  <input
                    type="number"
                    value={editRoundDuration}
                    onChange={(e) => setEditRoundDuration(Number(e.target.value))}
                    min="1"
                    required
                    disabled={loading}
                  />
                </label>
              </div>
              <button type="submit" disabled={loading}>
                {loading ? 'Сохранение...' : 'Сохранить настройки'}
              </button>
            </form>
          )}
          {auction.status === 'ended' && (
            <div className="create-auction" style={{ marginTop: '30px', paddingTop: '30px', borderTop: '1px solid #444' }}>
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
                  value={newAuctionReward}
                  onChange={(e) => setNewAuctionReward(Number(e.target.value))}
                  min="1"
                  required
                  disabled={loading}
                />
              </label>
            </div>
            <div className="form-group">
              <label>
                Победителей в раунде:
                <input
                  type="number"
                  value={newWinnersPerRound}
                  onChange={(e) => setNewWinnersPerRound(Number(e.target.value))}
                  min="1"
                  required
                  disabled={loading}
                />
              </label>
            </div>
            <div className="form-group">
              <label>
                Всего раундов:
                <input
                  type="number"
                  value={newTotalRounds}
                  onChange={(e) => setNewTotalRounds(Number(e.target.value))}
                  min="1"
                  required
                  disabled={loading}
                />
              </label>
            </div>
            <div className="form-group">
              <label>
                Длительность раунда (мин.):
                <input
                  type="number"
                  value={newRoundDuration}
                  onChange={(e) => setNewRoundDuration(Number(e.target.value))}
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
                  value={newAuctionReward}
                  onChange={(e) => setNewAuctionReward(Number(e.target.value))}
                  min="1"
                  required
                  disabled={loading}
                />
              </label>
            </div>
            <div className="form-group">
              <label>
                Победителей в раунде:
                <input
                  type="number"
                  value={newWinnersPerRound}
                  onChange={(e) => setNewWinnersPerRound(Number(e.target.value))}
                  min="1"
                  required
                  disabled={loading}
                />
              </label>
            </div>
            <div className="form-group">
              <label>
                Всего раундов:
                <input
                  type="number"
                  value={newTotalRounds}
                  onChange={(e) => setNewTotalRounds(Number(e.target.value))}
                  min="1"
                  required
                  disabled={loading}
                />
              </label>
            </div>
            <div className="form-group">
              <label>
                Длительность раунда (мин.):
                <input
                  type="number"
                  value={newRoundDuration}
                  onChange={(e) => setNewRoundDuration(Number(e.target.value))}
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
