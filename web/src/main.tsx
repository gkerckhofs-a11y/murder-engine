import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

class AppErrorBoundary extends React.Component<
  {children:React.ReactNode},
  {error:Error|null}
>{
  state={error:null as Error|null};

  static getDerivedStateFromError(error:Error){
    return {error};
  }

  componentDidCatch(error:Error,info:React.ErrorInfo){
    console.error('Murder Engine UI crash',error,info);
  }

  render(){
    if(this.state.error){
      return <main className="playerShell">
        <section className="playerCard">
          <p className="eyebrow">MURDER ENGINE</p>
          <h1>Erreur d’affichage</h1>
          <p className="playerError">{this.state.error.message||'UNKNOWN_UI_ERROR'}</p>
          <button className="playerPrimary" onClick={()=>window.location.reload()}>
            Recharger
          </button>
        </section>
      </main>;
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App/>
    </AppErrorBoundary>
  </React.StrictMode>
);
