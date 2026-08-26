export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container-fluid">
        <div className="row text-muted">
          <div className="col-6 text-start">
            <p className="mb-0">
              <strong>DevSquad Stats</strong> &copy; {year}
            </p>
          </div>
          <div className="col-6 text-end">
            <p className="mb-0 text-muted small">Datos desde Azure DevOps</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
