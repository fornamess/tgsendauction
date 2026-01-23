import { useEffect, useState } from 'react';
import api from '../utils/api';
import AuctionDisplay from '../components/AuctionDisplay';
import './HomePage.css';

interface HomePageProps {
  userId: string;
}

function HomePage({ userId }: HomePageProps) {
  const [auction, setAuction] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuction();
  }, []);

  const fetchAuction = async () => {
    try {
      const response = await api.get('/api/auction/current');
      setAuction(response.data);
    } catch (err) {
      console.error('Ошибка загрузки аукциона:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Загрузка аукциона...</div>;
  }

  if (!auction) {
    return (
      <div className="no-auction">
        <h2>Активный аукцион не найден</h2>
        <p>Дождитесь запуска нового аукциона или создайте его в админ-панели.</p>
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="auction-info">
        <h2>{auction.name}</h2>
        <div className="prize-info">
          Приз: <strong>{auction.rewardAmount ?? auction.prizeRobux} робуксов</strong> каждому из топ-
          {auction.winnersPerRound ?? 100}
        </div>
      </div>
      <AuctionDisplay userId={userId} />
    </div>
  );
}

export default HomePage;
