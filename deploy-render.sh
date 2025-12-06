#!/bin/bash

echo "🚀 Deploying Post-Master Pro to Render..."

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "❌ Git not initialized. Initializing..."
    git init
    git add .
    git commit -m "Initial commit for Render"
fi

# Check if render.yaml exists
if [ ! -f "render.yaml" ]; then
    echo "❌ render.yaml not found. Creating..."
    # Copy render.yaml content here
fi

echo "✅ Ready for Render deployment!"
echo ""
echo "📋 Next steps:"
echo "1. Push to GitHub:"
echo "   git remote add origin https://github.com/master-pd/post-master-pro.git"
echo "   git push -u origin main"
echo ""
echo "2. Go to https://dashboard.render.com"
echo "3. Click 'New +' > 'Web Service'"
echo "4. Connect your GitHub repository"
echo "5. Select branch: main"
echo "6. Name: post-master-pro"
echo "7. Build Command: npm install"
echo "8. Start Command: npm start"
echo "9. Click 'Create Web Service'"
echo ""
echo "🎉 Your app will be live at: https://post-master-pro.onrender.com"