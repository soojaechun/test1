"""AXPORT frontend preview. No API keys or uploaded files are read."""
from flask import Flask, render_template

app = Flask(__name__)
app.config['TEMPLATES_AUTO_RELOAD'] = True

@app.get('/')
def home():
    return render_template('home.html')

@app.get('/app')
def workspace():
    return render_template('workspace.html')

if __name__ == '__main__':
    # Additive widget connection; existing routes and app.run remain unchanged.
    from _axport_semiconductor_widgets.app_connection import connect_dashboard
    connect_dashboard(app)
    app.run(host='127.0.0.1', port=5073, debug=False, load_dotenv=False)
